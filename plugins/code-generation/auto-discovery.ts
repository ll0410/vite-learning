// 插件示例：扫描目录生成组件注册表和约定式路由。
// 学习点：文件内容变化走 Vite 默认 HMR，目录结构变化需主动失效虚拟模块。
import { readdirSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { normalizePath, type Plugin } from 'vite'

// 业务代码使用的虚拟模块 ID，例如：import routes from 'virtual:conventional-routes'。
// 它们不对应真实的磁盘文件，模块内容由本插件的 load 钩子动态生成。
const COMPONENTS_ID = 'virtual:auto-components'
const ROUTES_ID = 'virtual:conventional-routes'
// \0 是 Rollup/Vite 虚拟模块的内部 ID 约定，可避免被其他插件当作普通文件路径处理。
// 业务代码仍使用上面的原始 ID，带 \0 的 ID 只在插件内部流转。
const RESOLVED_COMPONENTS_ID = `\0${COMPONENTS_ID}`
const RESOLVED_ROUTES_ID = `\0${ROUTES_ID}`

/**
 * 递归收集目录下的所有 .vue 文件，返回排序后的绝对路径。
 * 排序可保证生成代码稳定，避免文件系统遍历顺序不同造成无意义的内容变化。
 */
function scanVueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) return scanVueFiles(file)
      return entry.isFile() && entry.name.endsWith('.vue') ? [file] : []
    })
    .sort()
}

/** 将文件绝对路径转成项目根目录下的导入路径，并把 Windows 路径分隔符统一为 /。 */
function rootImport(root: string, file: string) {
  return `/${normalizePath(relative(root, file))}`
}

/**
 * 将一个视图文件转换成 vue-router 路由记录的源码字符串。
 *
 * 例如 user/[id].vue 会生成：
 * - path: /conventional/user/:id
 * - name: conventional-user-id
 * - component: () => import('/src/views/conventional/user/[id].vue')
 *
 * index.vue 会去掉末尾的 index 段，因此 user/index.vue 对应 /conventional/user。
 * 这里返回字符串而不是对象，是因为最终要把它拼接到虚拟模块的 JavaScript 源码中。
 */
function routeRecord(root: string, viewsDir: string, file: string) {
  const relativeName = normalizePath(relative(viewsDir, file)).replace(/\.vue$/, '')
  const segments = relativeName.split('/')
  if (segments.at(-1) === 'index') segments.pop()

  // [id].vue 转为 :id 动态参数，index.vue 则归入父级路径。
  const pathSegments = segments.map((segment) => {
    const dynamic = segment.match(/^\[(.+)\]$/)
    return dynamic ? `:${dynamic[1]}` : segment
  })
  // 路由 path 需要 :id 形式，name 则只保留参数名 id。
  const nameSegments = segments.map((segment) => segment.replace(/^\[(.+)\]$/, '$1'))
  const path = `/conventional${pathSegments.length ? `/${pathSegments.join('/')}` : ''}`
  const name = `conventional-${nameSegments.join('-') || 'index'}`

  // 动态 import 让 Vite 可以按路由拆分代码，访问该路由时才加载视图。
  return `  {
    path: ${JSON.stringify(path)},
    name: ${JSON.stringify(name)},
    component: () => import(${JSON.stringify(rootImport(root, file))}),
  }`
}

/**
 * 创建自动发现插件，提供两个虚拟模块：
 * - virtual:auto-components：静态导入组件，导出组件注册表。
 * - virtual:conventional-routes：按文件路径生成路由，动态导入对应视图。
 */
export function autoDiscoveryPlugin(): Plugin {
  let root = ''

  // configResolved 执行前还不知道项目根目录，因此在各个钩子调用时再计算扫描目录。
  const directories = () => ({
    components: join(root, 'src/components/auto'),
    views: join(root, 'src/views/conventional'),
  })

  // Vite 插件本质上是一个包含若干钩子的对象，Vite 会在对应阶段依次调用这些钩子。
  return {
    name: 'lab:auto-discovery',

    // 配置解析完成后保存 root，后续的目录扫描和导入路径生成都依赖它。
    configResolved(config) {
      root = config.root
    },

    // 仅在开发服务器中配置目录监听；生产构建不需要文件监听和 HMR。
    configureServer(server) {
      const { components, views } = directories()
      // 将扫描目录与对应的虚拟模块关联，后续只失效受影响的模块。
      const watched = [
        { directory: components, resolvedId: RESOLVED_COMPONENTS_ID },
        { directory: views, resolvedId: RESOLVED_ROUTES_ID },
      ]
      // 显式监听扫描目录，以便在文件新增或删除时重新生成模块清单。
      server.watcher.add(watched.map(({ directory }) => directory))

      const invalidateStructure = (file: string) => {
        if (!file.endsWith('.vue')) return
        // watcher 给出的路径可能因操作系统而异，统一分隔符后再判断所属目录。
        const normalizedFile = normalizePath(file)
        const target = watched.find(({ directory }) =>
          normalizedFile.startsWith(`${normalizePath(directory)}/`),
        )
        if (!target) return

        // 虚拟模块尚未被请求时不在模块图中，此时无需失效。
        const module = server.moduleGraph.getModuleById(target.resolvedId)
        if (!module) return
        // 清除旧的转换结果，下次请求该模块时会重新执行 load 并扫描目录。
        server.moduleGraph.invalidateModule(module)
        // 清单变化可能影响全局路由或组件注册，整页刷新让应用重新获取生成结果。
        server.ws.send({ type: 'full-reload', path: '*' })
      }

      // 只有新增或删除文件会改变生成清单，内容修改无需重新扫描目录。
      server.watcher.on('add', invalidateStructure)
      server.watcher.on('unlink', invalidateStructure)
    },

    // 解析 import 中的模块 ID：命中虚拟模块时返回内部 ID，否则交给 Vite 继续解析。
    resolveId(id) {
      if (id === COMPONENTS_ID) return RESOLVED_COMPONENTS_ID
      if (id === ROUTES_ID) return RESOLVED_ROUTES_ID
    },

    // 加载 resolveId 认领的虚拟模块，直接返回 JavaScript 源码字符串。
    load(id) {
      if (id !== RESOLVED_COMPONENTS_ID && id !== RESOLVED_ROUTES_ID) return

      const { components, views } = directories()
      if (id === RESOLVED_COMPONENTS_ID) {
        const files = scanVueFiles(components)
        // 把源文件登记为虚拟模块依赖，让 Vite 的模块图知道它们之间的关联。
        files.forEach((file) => this.addWatchFile(file))
        // 组件注册表使用静态导入，生成的导入标识符按索引与注册项一一对应。
        const imports = files.map(
          (file, index) => `import Component${index} from ${JSON.stringify(rootImport(root, file))}`,
        )
        const entries = files.map(
          (file, index) =>
            `  { name: ${JSON.stringify(basename(file, '.vue'))}, component: Component${index} }`,
        )
        return `${imports.join('\n')}\nexport default [\n${entries.join(',\n')}\n]`
      }

      const files = scanVueFiles(views)
      files.forEach((file) => this.addWatchFile(file))
      const records = files.map((file) => routeRecord(root, views, file))
      return `export default [\n${records.join(',\n')}\n]`
    },
  }
}
