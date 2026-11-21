// 插件示例：通过 virtual:on-demand-data/<dataset>/<key> 仅导出被引用的数据项。
// 学习点：一个数据文件可对应多个虚拟模块，开发期只失效引用该文件的模块。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

// 动态 ID 同时携带数据集与键名，例如 virtual:on-demand-data/icons/add。
// 不同键会生成不同模块，因此导入一个键时不必把整份 JSON 打包进该模块。
const VIRTUAL_PREFIX = 'virtual:on-demand-data/'
// \0 仅出现在插件内部的已解析 ID 中，业务代码始终使用不带 \0 的公共 ID。
const RESOLVED_PREFIX = `\0${VIRTUAL_PREFIX}`
const DATASETS = ['icons', 'dictionary']

/**
 * 解析公共 ID 去掉前缀后的部分，例如 icons/add 返回 { dataset: 'icons', key: 'add' }。
 * 数据集不受支持、缺少键名或存在额外路径段时直接报错，避免读取意外文件。
 */
function parseRequest(id: string) {
  const [dataset, key, extra] = id.split('/')
  if (!DATASETS.includes(dataset) || !key || extra) {
    throw new Error(`Invalid on-demand data request: ${id}`)
  }
  return { dataset, key }
}

/**
 * 创建按需数据插件：每个虚拟模块只默认导出 JSON 中的一个字符串值。
 * 例如加载 icons/add 时，返回等价于 export default "..." 的模块源码。
 * 同一份数据文件可对应许多虚拟模块，requestedFiles 用于在文件变化时精确失效它们。
 */
export function onDemandDataPlugin(): Plugin {
  let root = ''
  // 记录“虚拟模块 -> 数据文件”，供文件变化时精确查找受影响模块。
  const requestedFiles = new Map<string, string>()

  // 数据集名称与 fixture 文件名一一对应，root 在 configResolved 后才可用。
  const datasetFile = (dataset: string) =>
    join(root, `src/plugin-lab/fixtures/codegen/${dataset}.json`)

  return {
    name: 'lab:on-demand-data',

    // 配置解析完成后保存项目根目录，供后续定位真实数据文件。
    configResolved(config) {
      root = config.root
    },

    // 仅在开发服务器中注册数据文件监听；生产构建通过 load 中的 addWatchFile 记录依赖。
    configureServer(server) {
      const files = DATASETS.map(datasetFile)
      server.watcher.add(files)

      const invalidateDataset = (file: string) => {
        let invalidated = false
        // 只遍历已经加载过且依赖当前文件的模块，未使用的数据键无需重新生成。
        requestedFiles.forEach((input, resolvedId) => {
          if (input !== file) return
          const module = server.moduleGraph.getModuleById(resolvedId)
          if (!module) return
          server.moduleGraph.invalidateModule(module)
          invalidated = true
        })
        if (invalidated) server.ws.send({ type: 'full-reload', path: '*' })
      }

      server.watcher.on('add', invalidateDataset)
      server.watcher.on('change', invalidateDataset)
      server.watcher.on('unlink', invalidateDataset)
    },

    // 对匹配前缀的导入认领解析权，并加上内部 \0 标记；具体路径格式在 load 中校验。
    resolveId(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) return `\0${id}`
    },

    // 输入是带 \0 的动态模块 ID，输出是仅含一个默认导出的 JavaScript 源码字符串。
    load(id) {
      if (!id.startsWith(RESOLVED_PREFIX)) return

      const { dataset, key } = parseRequest(id.slice(RESOLVED_PREFIX.length))
      const file = datasetFile(dataset)
      const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, string>
      if (!Object.hasOwn(data, key)) {
        throw new Error(`Unknown on-demand data key: ${dataset}/${key}`)
      }

      // 同时登记构建依赖与开发期反向索引，文件变化时才能找到所有引用它的动态模块。
      this.addWatchFile(file)
      requestedFiles.set(id, file)
      return `export default ${JSON.stringify(data[key])}`
    },
  }
}
