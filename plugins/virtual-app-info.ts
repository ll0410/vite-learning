// ch10-1：虚拟模块插件。
// 浏览器里 import 'virtual:app-info'，但磁盘上根本不存在这个文件。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:app-info'
// 约定：虚拟模块的 resolveId 结果以 \0 开头，避免被其他插件当成真实路径再处理
const RESOLVED_ID = '\0' + VIRTUAL_ID

/**
 * 创建 app-info 虚拟模块插件。
 * 业务代码可写 import appInfo from 'virtual:app-info'，读取名称、版本、构建时间和 Git 等元数据。
 * 元数据在 Vite 的 Node.js 进程中收集，再序列化为浏览器可导入的 JavaScript 模块。
 */
export function appInfoPlugin(): Plugin {
  // 在插件实例创建时记录一次，避免同一实例多次 load 产生不同的构建时间。
  const builtAt = new Date().toISOString()
  let gitCommit = 'unavailable'
  let mode = ''

  return {
    name: 'lab:virtual-app-info',

    // configResolved 在配置合并完成后执行，可以读取最终的 root 和 mode。
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

    // resolveId 把公开导入名映射为内部 ID；未命中时返回 undefined，交给 Vite 继续解析。
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },

    // load 只处理上面认领的内部 ID，返回模块源码字符串，而不是直接返回数据对象。
    // 读取 package.json 发生在 Vite 的 Node.js 环境，不会变成浏览器运行时请求。
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
