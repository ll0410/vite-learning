import type { RouteRecordRaw } from 'vue-router'

export const devServerRoutes: RouteRecordRaw[] = [
  {
    path: '/plugins/dev-server/mock-api',
    name: 'dev-server-mock-api',
    component: () => import('@/views/plugins/dev-server/DevServerDemos.vue'),
    props: { scenario: 'mock-api' },
  },
]
