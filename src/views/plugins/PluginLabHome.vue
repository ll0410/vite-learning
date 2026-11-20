<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { pluginLabCategories } from '@/plugin-lab/catalog'

const docsBase = import.meta.env.DEV ? 'http://localhost:5174' : `${import.meta.env.BASE_URL}docs`
const isDev = import.meta.env.DEV
</script>

<template>
  <section>
    <h1>插件实验室</h1>
    <p class="lead">
      按真实使用场景组织最小插件。页面示例用于观察 dev 效果；构建期插件通过产物断言验收。
    </p>
    <p class="links">
      <a :href="`${docsBase}/plugins/`" target="_blank" rel="noreferrer">插件开发指南</a>
      <a v-if="isDev" href="/__inspect/" target="_blank" rel="noreferrer">打开 Inspect</a>
    </p>

    <section v-for="category in pluginLabCategories" :key="category.id" class="category">
      <h2>{{ category.title }}</h2>
      <ol v-if="category.items.length" class="items">
        <li v-for="item in category.items" :id="item.id" :key="item.id" class="item">
          <div class="item-heading">
            <strong>{{ item.title }}</strong>
            <span v-if="item.buildOnly" class="badge">构建验证</span>
          </div>
          <p>{{ item.verify }}</p>
          <div class="item-links">
            <RouterLink v-if="item.demo" :to="item.demo">验证示例</RouterLink>
            <a :href="`${docsBase}${item.guide}`" target="_blank" rel="noreferrer">开发指南</a>
          </div>
        </li>
      </ol>
      <p v-else class="empty">该分类的指南与示例尚未接入。</p>
    </section>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.lead {
  margin: 0 0 12px;
  color: #4b5563;
}

.links,
.item-links {
  display: flex;
  gap: 16px;
}

.links {
  margin-bottom: 24px;
}

a {
  color: #2563eb;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.category {
  margin-top: 24px;
}

.category h2 {
  margin: 0 0 12px;
  font-size: 19px;
}

.items {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  scroll-margin-top: 20px;
}

.item-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item p {
  margin: 8px 0 12px;
  color: #6b7280;
  font-size: 14px;
}

.item-links {
  font-size: 14px;
}

.badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 12px;
}

.empty {
  color: #9ca3af;
  font-size: 14px;
}
</style>
