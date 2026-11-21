import type { Plugin } from 'vite'
import { legacyRollupPlugin } from './legacy-rollup.ts'

/** 汇总迁移示例插件；目前仅启用 Rollup 兼容核心加 Vite 薄适配层的演示。 */
export function migrationPlugins(): Plugin[] {
  return [legacyRollupPlugin()]
}
