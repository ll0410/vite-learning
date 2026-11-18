<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'

const title = import.meta.env.VITE_APP_TITLE
// 注意：模板表达式里不能直接用 import.meta，必须在 script 中取出来
const mode = import.meta.env.MODE

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
]
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <strong class="brand">{{ title }}</strong>
      <nav class="nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to">
          {{ item.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="content">
      <RouterView />
    </main>

    <footer class="footer">
      <span>Vite 8 · Vue 3 · {{ mode }} mode</span>
    </footer>
  </div>
</template>

<style scoped>
.layout {
  max-width: 880px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.brand {
  font-size: 16px;
}

.nav {
  display: flex;
  gap: 8px;
}

.nav a {
  padding: 6px 12px;
  border-radius: 999px;
  color: #4b5563;
  text-decoration: none;
  font-size: 14px;
}

.nav a:hover {
  background: #f3f4f6;
}

.nav a.router-link-active {
  background: #111827;
  color: #fff;
}

.content {
  padding: 24px 0;
}

.footer {
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  color: #9ca3af;
  font-size: 12px;
}
</style>
