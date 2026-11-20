import type { Plugin } from 'vite'
import { legacyRollupPlugin } from './legacy-rollup.ts'

export function migrationPlugins(): Plugin[] {
  return [legacyRollupPlugin()]
}
