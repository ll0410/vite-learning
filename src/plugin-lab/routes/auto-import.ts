import type { RouteRecordRaw } from 'vue-router'

export const autoImportRoutes: RouteRecordRaw[] = [
  {
    path: '/plugins/auto-import',
    name: 'plugin-auto-import',
    component: () => import('@/views/plugins/categories/AutoImportDemo.vue'),
  },
]
