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

export function injectScripts(options: InjectScriptsOptions = {}): Plugin {
  const scripts = options.scripts ?? localScripts

  return {
    name: 'plugin-lab:inject-scripts',
    transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
      return {
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
