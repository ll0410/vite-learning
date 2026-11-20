import type { RouteRecordRaw } from 'vue-router'

export const codeGenerationRoutes: RouteRecordRaw[] = [
  {
    path: '/plugin-lab/code-generation',
    name: 'plugin-code-generation',
    component: () => import('@/views/plugins/categories/CodeGenerationDemos.vue'),
  },
]
