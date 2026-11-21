// 附录 21：写盘前替换构建产物中的受控占位域名。
// 学习点：chunk 在 renderChunk 改写可让文件名哈希反映最终内容，asset 在 generateBundle 处理。
import type { Plugin } from 'vite'

const PLACEHOLDER = '__PUBLIC_ORIGIN__'
const PUBLIC_ORIGIN = 'https://static.example.com'
const TEXT_FILE = /\.(?:m?js|cjs|css|html|json|txt|svg|xml|map)$/i

/** 只替换受控占位符；split/join 可实现全局替换，也无需处理正则特殊字符。 */
function replaceOrigin(source: string): string {
  return source.split(PLACEHOLDER).join(PUBLIC_ORIGIN)
}

/** 统计替换次数，供构建结束时汇总日志和“未命中”警告使用。 */
function countPlaceholders(source: string): number {
  return source.split(PLACEHOLDER).length - 1
}

/**
 * 创建产物占位符替换插件，仅在构建阶段运行。
 *
 * JS chunk 在 renderChunk 中改写，使最终文件名哈希能反映替换后的内容；CSS、HTML、JSON 等 asset
 * 则在 generateBundle 中直接修改。两个阶段共用一个计数器，因此日志统计的是整次构建的替换总数。
 */
export function replaceBuiltAssetsPlugin(): Plugin {
  let replaced = 0

  return {
    name: 'lab:build-output:replace-built-assets',
    apply: 'build',

    buildStart() {
      // watch 模式会多次构建，每次都要重新计数，不能把上一轮结果累计进来。
      replaced = 0
    },

    renderChunk(code) {
      const count = countPlaceholders(code)
      // 返回 null 表示未修改，让 Rollup 继续使用原 chunk 内容和 source map。
      if (count === 0) return null

      replaced += count
      return { code: replaceOrigin(code), map: null }
    },

    generateBundle(_options, bundle) {
      // 此时尚未写盘，可直接修改 bundle 中文本 asset 的 source，补齐 renderChunk 覆盖不到的文件类型。
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
