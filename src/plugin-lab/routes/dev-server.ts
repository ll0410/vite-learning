import type { RouteRecordRaw } from 'vue-router'

export const devServerRoutes: RouteRecordRaw[] = [
  {
    path: '/plugins/dev-server/mock-api',
    name: 'dev-server-mock-api',
    component: () => import('@/views/plugins/dev-server/DevServerDemos.vue'),
    props: { scenario: 'mock-api' },
  },
  {
    path: '/plugins/dev-server/proxy-fallback-demo',
    name: 'dev-server-proxy-fallback',
    component: () => import('@/views/plugins/dev-server/DevServerDemos.vue'),
    props: { scenario: 'proxy-fallback' },
  },
  {
    path: '/plugins/dev-server/debug-endpoints-demo',
    name: 'dev-server-debug-endpoints',
    component: () => import('@/views/plugins/dev-server/DevServerDemos.vue'),
    props: { scenario: 'debug-endpoints' },
  },
]
