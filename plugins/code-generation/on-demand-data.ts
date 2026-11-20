import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_PREFIX = 'virtual:on-demand-data/'
const RESOLVED_PREFIX = `\0${VIRTUAL_PREFIX}`
const DATASETS = ['icons', 'dictionary']

function parseRequest(id: string) {
  const [dataset, key, extra] = id.split('/')
  if (!DATASETS.includes(dataset) || !key || extra) {
    throw new Error(`Invalid on-demand data request: ${id}`)
  }
  return { dataset, key }
}

export function onDemandDataPlugin(): Plugin {
  let root = ''
  const requestedFiles = new Map<string, string>()

  const datasetFile = (dataset: string) =>
    join(root, `src/plugin-lab/fixtures/codegen/${dataset}.json`)

  return {
    name: 'lab:on-demand-data',

    configResolved(config) {
      root = config.root
    },

    configureServer(server) {
      const files = DATASETS.map(datasetFile)
      server.watcher.add(files)

      const invalidateDataset = (file: string) => {
        let invalidated = false
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

    resolveId(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) return `\0${id}`
    },

    load(id) {
      if (!id.startsWith(RESOLVED_PREFIX)) return

      const { dataset, key } = parseRequest(id.slice(RESOLVED_PREFIX.length))
      const file = datasetFile(dataset)
      const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, string>
      if (!Object.hasOwn(data, key)) {
        throw new Error(`Unknown on-demand data key: ${dataset}/${key}`)
      }

      this.addWatchFile(file)
      requestedFiles.set(id, file)
      return `export default ${JSON.stringify(data[key])}`
    },
  }
}
