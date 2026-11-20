// ch05：基础路由。
// ch11：About / Assets / Dashboard 改为路由级懒加载，形成独立 chunk。
import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import { pluginLabRoutes } from '@/plugin-lab/routes'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: Home },
    {
      path: '/plugins',
      name: 'plugin-lab',
      component: () => import('@/views/plugins/PluginLabHome.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/About.vue'),
    },
    {
      path: '/assets',
      name: 'assets',
      component: () => import('@/views/Assets.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
    },
    ...pluginLabRoutes,
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFound.vue'),
    },
  ],
})
