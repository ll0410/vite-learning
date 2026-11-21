import type { Plugin } from 'vite'
import { replaceBuiltAssetsPlugin } from './replace-built-assets.ts'
import { ssrManifestPlugin } from './ssr-manifest.ts'
import { deploymentArtifactsPlugin } from './deployment-artifacts.ts'
import { staticDeploymentPlugin } from './static-deployment.ts'

/** 按依赖顺序汇总构建输出示例插件，返回的数组可展开到 Vite 配置的 plugins 中。 */
export function buildOutputPlugins(): Plugin[] {
  // 顺序固定：先替换内容，再计算版本哈希，最后改写 HTML 并添加 SRI。
  // 后两个插件都使用 post generateBundle；同一 order 内仍按注册顺序执行，因此这里不能随意调换。
  return [
    replaceBuiltAssetsPlugin(),
    ssrManifestPlugin(),
    deploymentArtifactsPlugin(),
    staticDeploymentPlugin(),
  ]
}
