import type { RouteRecordRaw } from 'vue-router'

export const customFileRoutes: RouteRecordRaw[] = [
  {
    path: '/plugins/custom-files-demo',
    name: 'plugin-custom-files',
    component: () => import('@/views/plugins/categories/CustomFileDemo.vue'),
  },
]
