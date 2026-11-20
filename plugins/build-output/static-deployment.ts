// 附录 20：为入口 JS/CSS 添加 SRI，并生成静态托管所需的 robots.txt / _headers。
// 学习点：HTML 在 generateBundle 的 post 阶段才进入 bundle，此时才能拿到最终引用并计算哈希。
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

const SRI_ALGORITHM = 'sha384'
const ROBOTS_TXT = `User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
`

function readAttribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1]
}

function withIntegrity(tag: string, integrity: string): string {
  const cleaned = tag
    .replace(/\s+integrity="[^"]*"/gi, '')
    .replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')

  return cleaned.replace(/(\s*\/?>)$/, ` integrity="${integrity}" crossorigin="anonymous"$1`)
}

export function staticDeploymentPlugin(): Plugin {
  return {
    name: 'lab:build-output:static-deployment',
    apply: 'build',

    generateBundle: {
      // Vite 的 HTML 插件在 post 阶段写入 index.html，普通阶段看不到它。
      order: 'post',
      handler(_options, bundle) {
        const integrityCache = new Map<string, string>()

        const integrityFor = (url: string): string | undefined => {
          if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:')) return undefined

          const fileName = url.split(/[?#]/)[0].replace(/^\/+/, '')
          if (!/\.(?:m?js|css)$/i.test(fileName)) return undefined

          const cached = integrityCache.get(fileName)
          if (cached) return cached

          const output = bundle[fileName]
          if (!output) return undefined

          const source = output.type === 'asset' ? output.source : output.code
          const integrity = `${SRI_ALGORITHM}-${createHash(SRI_ALGORITHM).update(source).digest('base64')}`
          integrityCache.set(fileName, integrity)
          return integrity
        }

        const htmlFiles: string[] = []

        for (const [fileName, output] of Object.entries(bundle)) {
          if (output.type !== 'asset' || !fileName.endsWith('.html')) continue
          htmlFiles.push(fileName)

          const html = typeof output.source === 'string'
            ? output.source
            : new TextDecoder().decode(output.source)

          const rewritten = html
            .replace(/<script\b[^>]*>/gi, (tag) => {
              const src = readAttribute(tag, 'src')
              const integrity = src ? integrityFor(src) : undefined
              return integrity ? withIntegrity(tag, integrity) : tag
            })
            .replace(/<link\b[^>]*>/gi, (tag) => {
              const rel = readAttribute(tag, 'rel')?.toLowerCase()
              if (rel !== 'stylesheet' && rel !== 'modulepreload') return tag

              const href = readAttribute(tag, 'href')
              const integrity = href ? integrityFor(href) : undefined
              return integrity ? withIntegrity(tag, integrity) : tag
            })

          output.source = rewritten
        }

        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: ROBOTS_TXT })

        const headers = [
          '/*',
          '  X-Content-Type-Options: nosniff',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '  X-Frame-Options: DENY',
          '',
          '/assets/*',
          '  Cache-Control: public, max-age=31536000, immutable',
          '',
          ...htmlFiles.flatMap((file) => [
            `/${file}`,
            '  Cache-Control: public, max-age=0, must-revalidate',
            '',
          ]),
        ].join('\n')

        this.emitFile({ type: 'asset', fileName: '_headers', source: headers })
      },
    },
  }
}
