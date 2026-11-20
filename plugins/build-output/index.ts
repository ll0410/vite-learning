import type { Plugin } from 'vite'
import { replaceBuiltAssetsPlugin } from './replace-built-assets.ts'
import { ssrManifestPlugin } from './ssr-manifest.ts'
import { deploymentArtifactsPlugin } from './deployment-artifacts.ts'
import { staticDeploymentPlugin } from './static-deployment.ts'

export function buildOutputPlugins(): Plugin[] {
  return [
    replaceBuiltAssetsPlugin(),
    ssrManifestPlugin(),
    deploymentArtifactsPlugin(),
    staticDeploymentPlugin(),
  ]
}
