// 附录 21：写盘前替换构建产物中的受控占位域名。
// 学习点：chunk 在 renderChunk 改写可让文件名哈希反映最终内容，asset 在 generateBundle 处理。
import type { Plugin } from 'vite'

const PLACEHOLDER = '__PUBLIC_ORIGIN__'
const PUBLIC_ORIGIN = 'https://static.example.com'
const TEXT_FILE = /\.(?:m?js|cjs|css|html|json|txt|svg|xml|map)$/i

function replaceOrigin(source: string): string {
  return source.split(PLACEHOLDER).join(PUBLIC_ORIGIN)
}

function countPlaceholders(source: string): number {
  return source.split(PLACEHOLDER).length - 1
}

export function replaceBuiltAssetsPlugin(): Plugin {
  let replaced = 0

  return {
    name: 'lab:build-output:replace-built-assets',
    apply: 'build',

    buildStart() {
      replaced = 0
    },

    renderChunk(code) {
      const count = countPlaceholders(code)
      if (count === 0) return null

      replaced += count
      return { code: replaceOrigin(code), map: null }
    },

    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'asset' || !TEXT_FILE.test(fileName)) continue

        const text = typeof output.source === 'string'
          ? output.source
          : new TextDecoder().decode(output.source)

        const count = countPlaceholders(text)
        if (count === 0) continue

        replaced += count
        output.source = replaceOrigin(text)
      }

      if (replaced === 0) {
        this.warn(`没有在产物中找到 ${PLACEHOLDER}，请确认受控 fixture 已被入口引用`)
      } else {
        this.info(`已替换 ${replaced} 处 ${PLACEHOLDER} -> ${PUBLIC_ORIGIN}`)
      }
    },
  }
}
