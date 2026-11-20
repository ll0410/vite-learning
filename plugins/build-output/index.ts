import type { Plugin } from 'vite'
import { replaceBuiltAssetsPlugin } from './replace-built-assets.ts'
import { ssrManifestPlugin } from './ssr-manifest.ts'
import { deploymentArtifactsPlugin } from './deployment-artifacts.ts'
import { staticDeploymentPlugin } from './static-deployment.ts'

export function buildOutputPlugins(): Plugin[] {
  // 顺序固定：先替换内容，再计算版本哈希，最后改写 HTML 并添加 SRI。
  return [
    replaceBuiltAssetsPlugin(),
    ssrManifestPlugin(),
    deploymentArtifactsPlugin(),
    staticDeploymentPlugin(),
  ]
}
