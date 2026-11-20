import type { Plugin } from 'vite'
import { appInfoPlugin } from '../virtual-app-info.ts'

export function codeGenerationPlugins(): Plugin[] {
  return [appInfoPlugin()]
}
