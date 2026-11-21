// 附录 20：为入口 JS/CSS 添加 SRI，并生成静态托管所需的 robots.txt / _headers。
// 学习点：HTML 在 generateBundle 的 post 阶段才进入 bundle，此时才能拿到最终引用并计算哈希。
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

const SRI_ALGORITHM = 'sha384'
const ROBOTS_TXT = `User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
`

/** 从构建器生成的单个 HTML 标签中读取双引号属性；找不到时返回 undefined。 */
function readAttribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1]
}

/** 先移除旧 SRI 配置，再补上一致的 integrity 与 crossorigin，避免重复属性。 */
function withIntegrity(tag: string, integrity: string): string {
  const cleaned = tag
    .replace(/\s+integrity="[^"]*"/gi, '')
    .replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')

  return cleaned.replace(/(\s*\/?>)$/, ` integrity="${integrity}" crossorigin="anonymous"$1`)
}

/**
 * 创建静态托管插件：为本地入口 JS/CSS 添加 SRI，并额外生成 robots.txt 与 _headers。
 *
 * SRI（子资源完整性）让浏览器把下载内容的摘要与 integrity 属性比对，不匹配就拒绝执行或应用资源。
 * 必须等最终 chunk/asset 进入 bundle 后再计算摘要，否则压缩、占位符替换等后续变化会使校验失效。
 */
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
          // 外链和 data URL 不属于本次 bundle，保持原样；这里只处理可枚举的本地 JS/CSS。
          if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:')) return undefined

          // HTML 的 /assets/app.js 对应 bundle 键 assets/app.js，查询串和 hash 不属于文件名。
          const fileName = url.split(/[?#]/)[0].replace(/^\/+/, '')
          if (!/\.(?:m?js|css)$/i.test(fileName)) return undefined

          const cached = integrityCache.get(fileName)
          if (cached) return cached

          const output = bundle[fileName]
          if (!output) return undefined

          const source = output.type === 'asset' ? output.source : output.code
          // SRI 属性使用“算法-base64 摘要”格式；缓存可避免多个 HTML 标签重复计算同一文件。
          const integrity = `${SRI_ALGORITHM}-${createHash(SRI_ALGORITHM).update(source).digest('base64')}`
          integrityCache.set(fileName, integrity)
          return integrity
        }

        const htmlFiles: string[] = []

        // 直接改写内存中的 HTML asset，为 script、stylesheet 和 modulepreload 引用补上摘要。
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

        // _headers 是部分静态托管平台识别的部署配置，不是由浏览器直接请求的业务资源。
        // 带内容哈希的 assets 可长期缓存；文件名固定的 HTML 则必须重新验证，避免引用过期资源。
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
