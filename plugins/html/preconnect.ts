import type { HtmlTagDescriptor, Plugin } from 'vite'

export interface PreconnectOptions {
  origins?: string[]
}

const localOrigins = [
  'http://localhost:5214/',
  'http://localhost:5214',
  'http://127.0.0.1:5214/',
  'http://127.0.0.1:5214',
]

function normalizeOrigins(origins: string[]): URL[] {
  const uniqueOrigins = new Map<string, URL>()

  for (const origin of origins) {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    uniqueOrigins.set(url.origin, url)
  }

  return [...uniqueOrigins.values()]
}

export function preconnect(options: PreconnectOptions = {}): Plugin {
  const origins = normalizeOrigins(options.origins ?? localOrigins)
  const hostnames = [...new Set(origins.map((url) => url.hostname))]

  return {
    name: 'plugin-lab:preconnect',
    transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
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
