// 附录 18：把构建产物整理成 SSR / 资源映射清单。
// 学习点：generateBundle 能拿到 chunk 的 file、css、imports，可据此生成自定义 manifest。
import type { Plugin } from 'vite'

interface LabManifest {
  entry: string
  file: string
  css: string[]
  imports: string[]
}

/**
 * 创建教学用 SSR 资源清单插件，仅在构建阶段运行。
 *
 * SSR 服务端需要知道入口最终输出名、关联 CSS 和静态依赖 chunk，才能在渲染 HTML 时加载正确资源。
 * 本例只生成单入口 lab-manifest.json，用来展示如何读取 bundle 与 Vite 元数据，并非完整复刻 Vite 官方 manifest。
 */
export function ssrManifestPlugin(): Plugin {
  return {
    name: 'lab:build-output:ssr-manifest',
    apply: 'build',

    generateBundle(_options, bundle) {
      // 只筛选入口 JS chunk；普通 asset 和按需加载的动态 chunk 都不是 SSR 的服务端渲染入口。
      const entries = Object.entries(bundle).filter(
        ([, output]) => output.type === 'chunk' && output.isEntry,
      )

      if (entries.length === 0) {
        this.error('没有找到入口 chunk，无法生成 lab-manifest.json')
      }

      // 单入口示例取 index；多入口项目应改为按入口名建立映射。
      const [fileName, chunk] = entries.find(([, output]) => output.name === 'index') ?? entries[0]

      if (chunk.type !== 'chunk') return

      // importedCss 是 Vite 附加在 chunk 上的 Set，展开为数组后才能直接序列化成 JSON。
      // imports 记录静态依赖 chunk 的最终文件名，动态依赖则位于 chunk.dynamicImports，本例不纳入清单。
      const manifest: LabManifest = {
        entry: chunk.name,
        file: fileName,
        css: [...(chunk.viteMetadata?.importedCss ?? [])],
        imports: [...chunk.imports],
      }

      // 把清单作为额外 asset 发射，它会与入口 chunk 一起写入输出目录。
      this.emitFile({
        type: 'asset',
        fileName: 'lab-manifest.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
  }
}
