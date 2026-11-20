import type { Plugin } from 'vite'
import { appInfoPlugin } from '../virtual-app-info.ts'
import { generatedModulesPlugin } from './generated-modules.ts'
import { autoDiscoveryPlugin } from './auto-discovery.ts'
import { onDemandDataPlugin } from './on-demand-data.ts'

export function codeGenerationPlugins(): Plugin[] {
  return [generatedModulesPlugin(), autoDiscoveryPlugin(), onDemandDataPlugin(), appInfoPlugin()]
}
