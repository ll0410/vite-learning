import type { Plugin } from 'vite'
import { ssrManifestPlugin } from './ssr-manifest.ts'
import { deploymentArtifactsPlugin } from './deployment-artifacts.ts'
import { staticDeploymentPlugin } from './static-deployment.ts'

export function buildOutputPlugins(): Plugin[] {
  return [
    ssrManifestPlugin(),
    deploymentArtifactsPlugin(),
    staticDeploymentPlugin(),
  ]
}
