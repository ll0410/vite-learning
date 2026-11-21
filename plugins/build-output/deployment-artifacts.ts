// 附录 19：为可缓存的构建产物生成版本文件与 CDN 上传清单。
// 学习点：在 post 阶段读取最终 chunk/asset 内容，可直接计算 SHA-256。
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

const CDN_BASE_URL = 'https://cdn.example.com/'
const MANIFEST_FILES = new Set(['version.json', 'cdn-manifest.json'])

interface CdnFile {
  path: string
  url: string
  sha256: string
}

/**
 * 计算文本或二进制内容的 SHA-256，并转成便于写入 JSON 的十六进制字符串。
 * asset.source 可能是字符串或 Uint8Array，chunk.code 则是字符串，所以这里同时支持两种输入。
 */
function sha256(source: string | Uint8Array): string {
  return createHash('sha256').update(source).digest('hex')
}

/**
 * 创建部署清单插件，仅在生产构建中运行。
 *
 * generateBundle 拿到的是尚待写盘的最终 bundle：插件据此生成 version.json 记录逐文件哈希与整批版本号，
 * 再生成 cdn-manifest.json 提供上传路径、完整 CDN URL 和内容摘要，无需扫描 outDir 或猜测哈希文件名。
 */
export function deploymentArtifactsPlugin(): Plugin {
  return {
    name: 'lab:build-output:deployment-artifacts',
    apply: 'build',

    // Vite 的部分产物（如异步 chunk 的 CSS）会在后续 post 钩子中定稿，
    // 因此必须在 post 阶段计算哈希，否则 version.json 会记录过期内容。
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const hashes = new Map<string, string>()

        // bundle 的键是输出目录内的相对路径；值分为 JS chunk 和 CSS、图片等 asset。
        for (const [fileName, output] of Object.entries(bundle)) {
          // HTML 会在 SRI 插件中被改写，不能在这里记录会过期的哈希。
          // 两个清单自身也排除在外，避免同名旧清单被纳入本次版本计算。
          if (fileName.endsWith('.html') || MANIFEST_FILES.has(fileName)) continue

          const source = output.type === 'asset' ? output.source : output.code
          hashes.set(fileName, sha256(source))
        }

        // 先按文件名排序，再对“文件名:文件哈希”列表做二次哈希，得到整批改动的稳定版本号。
        // 文件内容不变时版本号就不变；下面的 builtAt 只记录构建时间，不参与版本号计算。
        const sorted = [...hashes.entries()].sort(([a], [b]) => a.localeCompare(b))
        const version = sha256(sorted.map(([file, hash]) => `${file}:${hash}`).join('\n'))

        const versionFile = {
          version,
          algorithm: 'sha256',
          builtAt: new Date().toISOString(),
          files: Object.fromEntries(sorted),
        }

        const cdnManifest = {
          baseUrl: CDN_BASE_URL,
          files: sorted.map<CdnFile>(([file, hash]) => ({
            path: file,
            url: new URL(file, CDN_BASE_URL).href,
            sha256: hash,
          })),
        }

        // emitFile 把新 asset 注入当前 bundle，之后由 Rollup 与其他产物统一写盘。
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: `${JSON.stringify(versionFile, null, 2)}\n`,
        })
        this.emitFile({
          type: 'asset',
          fileName: 'cdn-manifest.json',
          source: `${JSON.stringify(cdnManifest, null, 2)}\n`,
        })
      },
    },
  }
}
