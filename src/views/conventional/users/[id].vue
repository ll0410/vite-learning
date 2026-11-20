<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <section>
    <h1>约定式动态用户页面</h1>
    <p>目录和 <code>[id].vue</code> 自动映射为 <code>/conventional/users/:id</code>。</p>
    <p>当前用户 ID：<strong>{{ route.params.id }}</strong></p>
    <RouterLink to="/conventional">返回约定式首页</RouterLink>
  </section>
</template>
