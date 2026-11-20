import type { RouteRecordRaw } from 'vue-router'

export const codeTransformRoutes: RouteRecordRaw[] = [
  {
    path: '/plugins/code-transform',
    name: 'plugin-lab-code-transform',
    component: () => import('@/views/plugins/categories/CodeTransformDemos.vue'),
  },
]
