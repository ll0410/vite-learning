<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { mountCounter } from '@/hmr-demo/counter'

// 两组状态，用来说明 HMR 只更新组件、不重置状态
const localCount = ref(0)
const counterEl = ref<HTMLElement>()

onMounted(() => {
  if (counterEl.value) mountCounter(counterEl.value)
})
</script>

<template>
  <div class="hmr">
    <p class="line">
      <span ref="counterEl" data-hmr-counter class="plain-counter" />
    </p>

    <p class="line">
      <button type="button" @click="localCount++">Vue 组件内计数：{{ localCount }}</button>
    </p>

    <p class="muted">
      先点几下，再修改本文件的模板或 <code>counter.ts</code>，观察数值是否保留。
    </p>
  </div>
</template>

<style scoped>
.hmr {
  display: grid;
  gap: 8px;
}

.line {
  margin: 0;
}

.plain-counter {
  display: inline-block;
  padding: 6px 10px;
  border: 1px dashed var(--brand);
  border-radius: 8px;
  color: #2f8f68;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

button {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

.muted {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
