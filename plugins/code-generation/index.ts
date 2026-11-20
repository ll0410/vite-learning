import type { Plugin } from 'vite'
import { appInfoPlugin } from '../virtual-app-info.ts'
import { generatedModulesPlugin } from './generated-modules.ts'

export function codeGenerationPlugins(): Plugin[] {
  return [generatedModulesPlugin(), appInfoPlugin()]
}
