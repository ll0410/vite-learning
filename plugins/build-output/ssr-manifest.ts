// 附录 18：把构建产物整理成 SSR / 资源映射清单。
// 学习点：generateBundle 能拿到 chunk 的 file、css、imports，可据此生成自定义 manifest。
import type { Plugin } from 'vite'

interface LabManifest {
  entry: string
  file: string
  css: string[]
  imports: string[]
}

export function ssrManifestPlugin(): Plugin {
  return {
    name: 'lab:build-output:ssr-manifest',
    apply: 'build',

    generateBundle(_options, bundle) {
      const entries = Object.entries(bundle).filter(
        ([, output]) => output.type === 'chunk' && output.isEntry,
      )

      if (entries.length === 0) {
        this.error('没有找到入口 chunk，无法生成 lab-manifest.json')
      }

      // 单入口示例取 index；多入口项目应改为按入口名建立映射。
      const [fileName, chunk] = entries.find(([, output]) => output.name === 'index') ?? entries[0]

      if (chunk.type !== 'chunk') return

      const manifest: LabManifest = {
        entry: chunk.name,
        file: fileName,
        css: [...(chunk.viteMetadata?.importedCss ?? [])],
        imports: [...chunk.imports],
      }

      this.emitFile({
        type: 'asset',
        fileName: 'lab-manifest.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
  }
}
