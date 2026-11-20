import type { RouteRecordRaw } from 'vue-router'
import conventionalRoutes from 'virtual:conventional-routes'

export const codeGenerationRoutes: RouteRecordRaw[] = [
  {
    path: '/plugin-lab/code-generation',
    name: 'plugin-code-generation',
    component: () => import('@/views/plugins/categories/CodeGenerationDemos.vue'),
  },
  ...conventionalRoutes,
]
