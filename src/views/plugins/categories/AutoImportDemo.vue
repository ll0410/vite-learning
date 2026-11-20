<script setup lang="ts">
const count = ref(0)
</script>

<template>
  <section class="demo">
    <p class="eyebrow">条目 9 · API 自动导入与组件按需引入</p>
    <h1>不手写 import，也能使用 ref 和局部组件</h1>
    <p class="lead">
      本文件的源码只声明 count。lab:auto-import 在 Vue 编译 SFC 前检测用法，并补入两条 import。
    </p>

    <pre><code>&lt;script setup lang="ts"&gt;
const count = ref(0)
&lt;/script&gt;</code></pre>

    <div class="panel">
      <p data-testid="auto-import-count">当前计数：{{ count }}</p>
      <button type="button" data-testid="auto-import-increment" @click="count += 1">
        点击 +1
      </button>
      <AutoImportBadge :count="count" />
    </div>

    <p class="hint">
      打开 <a href="/__inspect/" target="_blank" rel="noreferrer">Inspect</a>，搜索
      <code>AutoImportDemo.vue</code>，在 <code>lab:auto-import</code> 的 TRANSFORM 结果中查看新增导入。
      类型提示来自插件生成的 <code>src/types/auto-import.d.ts</code>。
    </p>
  </section>
</template>

<style scoped>
.demo {
  max-width: 760px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #059669;
  font-size: 13px;
  font-weight: 600;
}

h1 {
  margin: 0 0 12px;
  font-size: 28px;
  line-height: 1.35;
}

.lead {
  color: #4b5563;
}

pre {
  overflow-x: auto;
  padding: 16px;
  border-radius: 10px;
  background: #111827;
  color: #e5e7eb;
}

pre code {
  padding: 0;
  background: transparent;
}

.panel {
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.panel > p:first-child {
  margin-top: 0;
  font-size: 20px;
  font-weight: 600;
}

button {
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: #059669;
  color: #fff;
  cursor: pointer;
}

button:hover {
  background: #047857;
}

.hint a {
  color: #2563eb;
}
</style>
