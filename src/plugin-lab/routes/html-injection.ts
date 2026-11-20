import type { RouteRecordRaw } from 'vue-router'

export const htmlInjectionRoutes: RouteRecordRaw[] = [
  {
    path: '/plugins/html-injection',
    name: 'plugin-lab-html-injection',
    component: () => import('@/views/plugins/categories/HtmlInjectionDemos.vue'),
  },
]
