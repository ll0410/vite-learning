// 插件示例：按 URL origin 去重注入 preconnect，并按 hostname 注入 dns-prefetch。
// head-prepend 让资源提示尽早生效；非 HTTP(S) 地址不会生成标签。
import type { HtmlTagDescriptor, Plugin } from 'vite'

export interface PreconnectOptions {
  origins?: string[]
}

const localOrigins = [
  'http://localhost:5173/',
  'http://localhost:5173',
  'http://127.0.0.1:5173/',
  'http://127.0.0.1:5173',
]

/**
 * 过滤非 HTTP(S) 地址，并按 origin（协议、主机名和端口的组合）去重。
 * 同一主机名的不同端口仍是不同连接目标，但后续会共享一条 DNS 提示。
 */
function normalizeOrigins(origins: string[]): URL[] {
  const uniqueOrigins = new Map<string, URL>()

  for (const origin of origins) {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    uniqueOrigins.set(url.origin, url)
  }

  return [...uniqueOrigins.values()]
}

/**
 * 创建资源提示注入插件：每个 origin 生成 preconnect，每个 hostname 生成 dns-prefetch。
 * preconnect 会提前建立连接，dns-prefetch 只提前解析域名；二者并不等价。
 */
export function preconnect(options: PreconnectOptions = {}): Plugin {
  const origins = normalizeOrigins(options.origins ?? localOrigins)
  const hostnames = [...new Set(origins.map((url) => url.hostname))]

  return {
    name: 'plugin-lab:preconnect',
    // transformIndexHtml 在 dev 响应和 build 生成 HTML 时执行，每个 HTML 入口都会经过此钩子。
    transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
      // 标签描述符由 Vite 序列化并插入 HTML；crossorigin 让预连接与跨域资源请求的凭据模式匹配。
      const preconnectTags: HtmlTagDescriptor[] = origins.map((url) => ({
        tag: 'link',
        attrs: {
          rel: 'preconnect',
          href: url.origin,
          crossorigin: true,
          'data-html-injection': 'preconnect',
        },
        injectTo: 'head-prepend',
      }))
      // DNS 只关心主机名，所以使用不含端口的 //hostname，并对不同端口对应的重复主机名去重。
      const dnsPrefetchTags: HtmlTagDescriptor[] = hostnames.map((hostname) => ({
        tag: 'link',
        attrs: {
          rel: 'dns-prefetch',
          href: `//${hostname}`,
          'data-html-injection': 'dns-prefetch',
        },
        injectTo: 'head-prepend',
      }))

      return { html, tags: [...preconnectTags, ...dnsPrefetchTags] }
    },
  }
}
