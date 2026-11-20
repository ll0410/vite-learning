<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), {
  label: '由 virtual:auto-components 全局注册',
})
</script>

<template>
  <span class="auto-badge">{{ label }}</span>
</template>

<style scoped>
.auto-badge {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 13px;
  font-weight: 600;
}
</style>
