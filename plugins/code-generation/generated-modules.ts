// 插件示例：把 JSON fixture 生成为 API、路由和 i18n 虚拟模块。
// 学习点：resolveId/load 负责生成代码，watcher + moduleGraph 负责输入变化后的失效与刷新。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

// 业务代码通过这些公共 ID 导入数据，例如 import { getUsers } from 'virtual:generated-api'。
// 三个模块都不存在于磁盘上，其 JavaScript 源码由下方的 load 钩子根据 JSON 生成。
const API_ID = 'virtual:generated-api'
const ROUTES_ID = 'virtual:generated-routes'
const I18N_ID = 'virtual:generated-i18n'

// \0 标记内部虚拟模块，避免其他插件把它当作磁盘路径继续解析。
const resolvedIds = {
  api: `\0${API_ID}`,
  routes: `\0${ROUTES_ID}`,
  i18n: `\0${I18N_ID}`,
}

/** api.json 中每个接口的描述：函数名、请求路径和 HTTP 方法。 */
interface ApiDescriptor {
  name: string
  path: string
  method: string
}

/** 同步读取一个 JSON 输入文件，并将其解析为生成模块所需的数据结构。 */
function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf-8')) as T
}

/**
 * 创建 JSON 驱动的代码生成插件：
 * - virtual:generated-api：把接口描述转换为带 request 辅助函数的命名导出。
 * - virtual:generated-routes：把路由 JSON 转换为默认导出的路由数组。
 * - virtual:generated-i18n：合并两份语言文件，默认导出按语言编码分组的消息对象。
 *
 * resolveId 把公共 ID 映射为内部 ID，load 再读取 fixture 并返回可执行模块源码。
 */
export function generatedModulesPlugin(): Plugin {
  let root = ''

  // 同一份语言模块依赖两个输入文件，因此 resolvedId 可以重复，用于建立完整的监听关系。
  const inputs = () => {
    const fixtureDir = join(root, 'src/plugin-lab/fixtures/codegen')
    return [
      { file: join(fixtureDir, 'api.json'), resolvedId: resolvedIds.api },
      { file: join(fixtureDir, 'routes.json'), resolvedId: resolvedIds.routes },
      { file: join(fixtureDir, 'locales/zh-CN.json'), resolvedId: resolvedIds.i18n },
      { file: join(fixtureDir, 'locales/en-US.json'), resolvedId: resolvedIds.i18n },
    ]
  }

  return {
    name: 'lab:generated-modules',

    // Vite 完成配置解析后调用此钩子；保存 root 才能定位项目内的 JSON fixture。
    configResolved(config) {
      root = config.root
    },

    // configureServer 仅在开发服务器启动时执行，生产构建不需要这里的文件监听与 HMR。
    configureServer(server) {
      // 虚拟模块没有真实文件路径，必须显式监听输入并失效对应模块。
      const watchedInputs = inputs()
      server.watcher.add(watchedInputs.map(({ file }) => file))

      const invalidateInput = (file: string) => {
        const input = watchedInputs.find((candidate) => candidate.file === file)
        if (!input) return

        // 尚未被浏览器请求的虚拟模块不在模块图中，也就没有旧结果需要清除。
        const module = server.moduleGraph.getModuleById(input.resolvedId)
        if (!module) return
        // 失效后，下次请求会重新执行 load；整页刷新确保应用拿到重新生成的导出。
        server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload', path: '*' })
      }

      server.watcher.on('add', invalidateInput)
      server.watcher.on('change', invalidateInput)
      server.watcher.on('unlink', invalidateInput)
    },

    // 解析 import 语句中的模块 ID；未命中时返回 undefined，让 Vite 和其他插件继续解析。
    resolveId(id) {
      if (id === API_ID) return resolvedIds.api
      if (id === ROUTES_ID) return resolvedIds.routes
      if (id === I18N_ID) return resolvedIds.i18n
    },

    // load 接收 resolveId 返回的内部 ID，输出 JavaScript 源码字符串，而不是 JSON 数据对象。
    load(id) {
      if (!Object.values(resolvedIds).includes(id)) return

      const fixtureDir = join(root, 'src/plugin-lab/fixtures/codegen')
      // addWatchFile 把真实 JSON 登记为虚拟模块依赖，让构建与开发监听都能追踪输入。
      inputs()
        .filter((input) => input.resolvedId === id)
        .forEach((input) => this.addWatchFile(input.file))

      if (id === resolvedIds.api) {
        const descriptors = readJson<ApiDescriptor[]>(join(fixtureDir, 'api.json'))
        const functions = descriptors.map((descriptor) => {
          // name 会成为 JavaScript 标识符，先校验可避免生成语法错误或意外代码。
          if (!/^[$A-Z_a-z][$\w]*$/.test(descriptor.name)) {
            throw new Error(`Invalid generated API function name: ${descriptor.name}`)
          }
          return `export const ${descriptor.name} = () => request(${JSON.stringify(
            descriptor.path,
          )}, { method: ${JSON.stringify(descriptor.method)} })`
        })

        return `async function request(path, init) {
  const response = await fetch(path, init)
  if (!response.ok) throw new Error(\`Request failed: \${response.status}\`)
  return response.json()
}
${functions.join('\n')}`
      }

      if (id === resolvedIds.routes) {
        const routes = readJson(join(fixtureDir, 'routes.json'))
        return `export default ${JSON.stringify(routes, null, 2)}`
      }

      if (id === resolvedIds.i18n) {
        const messages = Object.fromEntries(
          ['zh-CN', 'en-US'].map((locale) => [
            locale,
            readJson(join(fixtureDir, `locales/${locale}.json`)),
          ]),
        )
        return `export default ${JSON.stringify(messages, null, 2)}`
      }
    },
  }
}
