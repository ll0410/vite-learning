<script setup lang="ts">
// ch07：CSS Modules 用法——把 module.css 当对象导入，类名通过 styles.xxx 访问。
import styles from '@/styles/button.module.css'

defineProps<{ label: string }>()

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button :class="styles.btn" type="button" @click="emit('click')">
    {{ label }}
  </button>
</template>

<style scoped lang="scss">
/* 这里能直接用 $brand，是因为 vite.config 里注入了 @use "@/styles/variables" as *; */
button {
  box-shadow: 0 1px 2px rgba($brand-dark, 0.25);
}
</style>
