import type { Plugin } from 'vite'
import { autoImportPlugin } from './auto-import.ts'

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
