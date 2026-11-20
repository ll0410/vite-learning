// 插件示例：把 JSON fixture 生成为 API、路由和 i18n 虚拟模块。
// 学习点：resolveId/load 负责生成代码，watcher + moduleGraph 负责输入变化后的失效与刷新。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const API_ID = 'virtual:generated-api'
const ROUTES_ID = 'virtual:generated-routes'
const I18N_ID = 'virtual:generated-i18n'

// \0 标记内部虚拟模块，避免其他插件把它当作磁盘路径继续解析。
const resolvedIds = {
  api: `\0${API_ID}`,
  routes: `\0${ROUTES_ID}`,
  i18n: `\0${I18N_ID}`,
}

interface ApiDescriptor {
  name: string
  path: string
  method: string
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf-8')) as T
}

export function generatedModulesPlugin(): Plugin {
  let root = ''

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

    configResolved(config) {
      root = config.root
    },

    configureServer(server) {
      // 虚拟模块没有真实文件路径，必须显式监听输入并失效对应模块。
      const watchedInputs = inputs()
      server.watcher.add(watchedInputs.map(({ file }) => file))

      const invalidateInput = (file: string) => {
        const input = watchedInputs.find((candidate) => candidate.file === file)
        if (!input) return

        const module = server.moduleGraph.getModuleById(input.resolvedId)
        if (!module) return
        server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload', path: '*' })
      }

      server.watcher.on('add', invalidateInput)
      server.watcher.on('change', invalidateInput)
      server.watcher.on('unlink', invalidateInput)
    },

    resolveId(id) {
      if (id === API_ID) return resolvedIds.api
      if (id === ROUTES_ID) return resolvedIds.routes
      if (id === I18N_ID) return resolvedIds.i18n
    },

    load(id) {
      if (!Object.values(resolvedIds).includes(id)) return

      const fixtureDir = join(root, 'src/plugin-lab/fixtures/codegen')
      inputs()
        .filter((input) => input.resolvedId === id)
        .forEach((input) => this.addWatchFile(input.file))

      if (id === resolvedIds.api) {
        const descriptors = readJson<ApiDescriptor[]>(join(fixtureDir, 'api.json'))
        const functions = descriptors.map((descriptor) => {
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
