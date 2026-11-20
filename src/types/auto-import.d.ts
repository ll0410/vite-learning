/* 由 plugins/auto-import/auto-import.ts 生成，请勿手动编辑。 */

export {}

declare global {
  const ref: typeof import('vue')['ref']
}

declare module 'vue' {
  interface GlobalComponents {
    AutoImportBadge: typeof import('@/components/auto-import/AutoImportBadge.vue')['default']
  }
}
