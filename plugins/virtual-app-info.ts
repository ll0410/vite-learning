// ch10-1：虚拟模块插件。
// 浏览器里 import 'virtual:app-info'，但磁盘上根本不存在这个文件。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:app-info'
// 约定：虚拟模块的 resolveId 结果以 \0 开头，避免被其他插件当成真实路径再处理
const RESOLVED_ID = '\0' + VIRTUAL_ID

export function appInfoPlugin(): Plugin {
  const builtAt = new Date().toISOString()
  let gitCommit = 'unavailable'
  let mode = ''

  return {
    name: 'lab:virtual-app-info',

    configResolved(config) {
      mode = config.mode
      try {
        gitCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
          cwd: config.root,
          encoding: 'utf-8',
        }).trim()
      } catch {
        // 从不含 .git 的源码包构建时仍可保留其他版本信息。
        gitCommit = 'unavailable'
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },

    load(id) {
      if (id !== RESOLVED_ID) return

      const pkg = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
      ) as { name: string; version: string; devDependencies: Record<string, string> }

      return `export default ${JSON.stringify({
        name: pkg.name,
        version: pkg.version,
        vite: pkg.devDependencies.vite,
        builtAt,
        gitCommit,
        mode,
      })}`
    },
  }
}
