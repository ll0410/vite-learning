import type { Plugin } from 'vite'
import { injectScripts } from './inject-scripts.ts'
import { injectHeadAssets } from './inject-head-assets.ts'

export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts(), injectHeadAssets()]
}
