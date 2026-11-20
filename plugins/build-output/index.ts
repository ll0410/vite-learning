import type { Plugin } from 'vite'
import { ssrManifestPlugin } from './ssr-manifest.ts'

export function buildOutputPlugins(): Plugin[] {
  return [ssrManifestPlugin()]
}
