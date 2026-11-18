// ch05：基础路由。ch11 会把 About/Dashboard 改成懒加载。
import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import About from '@/views/About.vue'
import Assets from '@/views/Assets.vue'
import NotFound from '@/views/NotFound.vue'

export const router = createRouter({
  // 用 BASE_URL 保证 base 配置改变时路由仍然正确
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/about', name: 'about', component: About },
    { path: '/assets', name: 'assets', component: Assets },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound },
  ],
})
