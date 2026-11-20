<script setup lang="ts">
defineProps<{
  count: number
}>()
</script>

<template>
  <p class="auto-import-badge" data-testid="auto-import-component">
    自动引入的组件已渲染，收到计数：<strong>{{ count }}</strong>
  </p>
</template>

<style scoped>
.auto-import-badge {
  margin: 16px 0;
  padding: 12px 16px;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  background: #ecfdf5;
  color: #047857;
}
</style>
