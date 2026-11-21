// 插件示例：通过 transformIndexHtml 的 tags 声明式注入 CDN、监控和统计脚本。
// 本地 stub 替代真实第三方请求，便于同时验证 dev 与 build 的 HTML 输出。
import type { HtmlTagDescriptor, Plugin } from 'vite'

export interface ScriptStub {
  purpose: 'cdn' | 'monitor' | 'analytics'
  src: string
}

export interface InjectScriptsOptions {
  scripts?: ScriptStub[]
}

const localScripts: ScriptStub[] = [
  { purpose: 'cdn', src: '/plugin-lab/cdn-stub.js' },
  { purpose: 'monitor', src: '/plugin-lab/monitor-stub.js' },
  { purpose: 'analytics', src: '/plugin-lab/analytics-stub.js' },
]

/**
 * 创建脚本注入插件，默认使用三个本地 stub，也可通过 options.scripts 替换清单。
 * 这里未声明 async/defer，因此这些传统脚本会阻塞 HTML 解析，并按文档顺序执行。
 */
export function injectScripts(options: InjectScriptsOptions = {}): Plugin {
  const scripts = options.scripts ?? localScripts

  return {
    name: 'plugin-lab:inject-scripts',
    // 钩子只生成 HTML 标签，不会在 Node.js 中执行脚本；浏览器解析最终页面时才请求 src。
    transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
      return {
        // 保留原 HTML，injectTo: 'head' 会让 Vite 将生成的 script 标签插入 head 结束标签之前。
        html,
        tags: scripts.map((script) => ({
          tag: 'script',
          attrs: {
            src: script.src,
            'data-html-injection': script.purpose,
          },
          injectTo: 'head',
        })),
      }
    },
  }
}
