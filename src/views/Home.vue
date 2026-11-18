<script setup lang="ts">
import { add, multiply } from '@/utils/math'

// 模板表达式里不能用 import.meta，统一在 script 里取值
const title = import.meta.env.VITE_APP_TITLE

const envRows = Object.entries(import.meta.env)
  .filter(([key]) => key.startsWith('VITE_') || ['MODE', 'DEV', 'PROD', 'BASE_URL'].includes(key))
  .sort(([a], [b]) => a.localeCompare(b))
</script>

<template>
  <section>
    <h1>{{ title }}</h1>
    <p class="lead">
      这是 ch05 之后的 Vue 版本。后续章节会继续在这个页面上叠加演示内容。
    </p>

    <div class="grid">
      <article class="panel">
        <h2>别名验证</h2>
        <p>2 + 3 = <b>{{ add(2, 3) }}</b></p>
        <p>2 × 3 = <b>{{ multiply(2, 3) }}</b></p>
        <p class="muted">来自 <code>@/utils/math</code></p>
      </article>

      <article class="panel">
        <h2>import.meta.env</h2>
        <table>
          <tbody>
            <tr v-for="[key, value] in envRows" :key="key">
              <td><code>{{ key }}</code></td>
              <td>{{ value }}</td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.lead {
  margin: 0 0 20px;
  color: #4b5563;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.panel {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.panel h2 {
  margin: 0 0 12px;
  font-size: 15px;
}

.panel p {
  margin: 4px 0;
  font-size: 14px;
}

.muted {
  color: #9ca3af;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

td {
  padding: 4px 0;
  border-bottom: 1px dashed #f3f4f6;
  vertical-align: top;
}

td:first-child {
  width: 45%;
  color: #6b7280;
}
</style>
