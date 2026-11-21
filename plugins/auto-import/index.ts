import type { Plugin } from 'vite'
import { autoImportPlugin } from './auto-import.ts'

/**
 * 配置自动导入示例：仅为指定演示组件补齐 ref 与 AutoImportBadge，
 * 并在 src/types/auto-import.d.ts 生成对应的全局类型声明。
 */
export function autoImportPlugins(): Plugin[] {
  return [
    autoImportPlugin({
      include: /\/src\/views\/plugins\/categories\/AutoImportDemo\.vue$/,
      imports: {
        ref: 'vue',
      },
      components: {
        AutoImportBadge: '@/components/auto-import/AutoImportBadge.vue',
      },
      dts: 'src/types/auto-import.d.ts',
    }),
  ]
}
