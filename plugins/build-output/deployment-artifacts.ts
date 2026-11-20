// 附录 19：为可缓存的构建产物生成版本文件与 CDN 上传清单。
// 学习点：generateBundle 中拿到的就是最终 chunk/asset 内容，可直接计算 SHA-256。
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

const CDN_BASE_URL = 'https://cdn.example.com/'
const MANIFEST_FILES = new Set(['version.json', 'cdn-manifest.json'])

interface CdnFile {
  path: string
  url: string
  sha256: string
}

function sha256(source: string | Uint8Array): string {
  return createHash('sha256').update(source).digest('hex')
}

export function deploymentArtifactsPlugin(): Plugin {
  return {
    name: 'lab:build-output:deployment-artifacts',
    apply: 'build',

    generateBundle(_options, bundle) {
      const hashes = new Map<string, string>()

      for (const [fileName, output] of Object.entries(bundle)) {
        // HTML 会在下一步被 SRI 插件改写，不能在这里记录会过期的哈希。
        if (fileName.endsWith('.html') || MANIFEST_FILES.has(fileName)) continue

        const source = output.type === 'asset' ? output.source : output.code
        hashes.set(fileName, sha256(source))
      }

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
  }
}
