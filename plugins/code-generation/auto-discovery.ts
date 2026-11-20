// 插件示例：扫描目录生成组件注册表和约定式路由。
// 学习点：文件内容变化走 Vite 默认 HMR，目录结构变化需主动失效虚拟模块。
import { readdirSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { normalizePath, type Plugin } from 'vite'

const COMPONENTS_ID = 'virtual:auto-components'
const ROUTES_ID = 'virtual:conventional-routes'
const RESOLVED_COMPONENTS_ID = `\0${COMPONENTS_ID}`
const RESOLVED_ROUTES_ID = `\0${ROUTES_ID}`

function scanVueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) return scanVueFiles(file)
      return entry.isFile() && entry.name.endsWith('.vue') ? [file] : []
    })
    .sort()
}

function rootImport(root: string, file: string) {
  return `/${normalizePath(relative(root, file))}`
}

function routeRecord(root: string, viewsDir: string, file: string) {
  const relativeName = normalizePath(relative(viewsDir, file)).replace(/\.vue$/, '')
  const segments = relativeName.split('/')
  if (segments.at(-1) === 'index') segments.pop()

  // [id].vue 转为 :id 动态参数，index.vue 则归入父级路径。
  const pathSegments = segments.map((segment) => {
    const dynamic = segment.match(/^\[(.+)\]$/)
    return dynamic ? `:${dynamic[1]}` : segment
  })
  const nameSegments = segments.map((segment) => segment.replace(/^\[(.+)\]$/, '$1'))
  const path = `/conventional${pathSegments.length ? `/${pathSegments.join('/')}` : ''}`
  const name = `conventional-${nameSegments.join('-') || 'index'}`

  return `  {
    path: ${JSON.stringify(path)},
    name: ${JSON.stringify(name)},
    component: () => import(${JSON.stringify(rootImport(root, file))}),
  }`
}

export function autoDiscoveryPlugin(): Plugin {
  let root = ''

  const directories = () => ({
    components: join(root, 'src/components/auto'),
    views: join(root, 'src/views/conventional'),
  })

  return {
    name: 'lab:auto-discovery',

    configResolved(config) {
      root = config.root
    },

    configureServer(server) {
      const { components, views } = directories()
      const watched = [
        { directory: components, resolvedId: RESOLVED_COMPONENTS_ID },
        { directory: views, resolvedId: RESOLVED_ROUTES_ID },
      ]
      server.watcher.add(watched.map(({ directory }) => directory))

      const invalidateStructure = (file: string) => {
        if (!file.endsWith('.vue')) return
        const normalizedFile = normalizePath(file)
        const target = watched.find(({ directory }) =>
          normalizedFile.startsWith(`${normalizePath(directory)}/`),
        )
        if (!target) return

        const module = server.moduleGraph.getModuleById(target.resolvedId)
        if (!module) return
        server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload', path: '*' })
      }

      // 只有新增或删除文件会改变生成清单，内容修改无需重新扫描目录。
      server.watcher.on('add', invalidateStructure)
      server.watcher.on('unlink', invalidateStructure)
    },

    resolveId(id) {
      if (id === COMPONENTS_ID) return RESOLVED_COMPONENTS_ID
      if (id === ROUTES_ID) return RESOLVED_ROUTES_ID
    },

    load(id) {
      if (id !== RESOLVED_COMPONENTS_ID && id !== RESOLVED_ROUTES_ID) return

      const { components, views } = directories()
      if (id === RESOLVED_COMPONENTS_ID) {
        const files = scanVueFiles(components)
        files.forEach((file) => this.addWatchFile(file))
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
