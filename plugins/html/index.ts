import type { Plugin } from 'vite'
import { injectScripts } from './inject-scripts.ts'

export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts()]
}
