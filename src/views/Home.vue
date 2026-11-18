<script setup lang="ts">
import { add, multiply } from '@/utils/math'
import HelloWorld from '@/components/HelloWorld.vue'
import Counter from '@/components/Counter.vue'
import { ref } from 'vue'
import appInfo from 'virtual:app-info'

const title = import.meta.env.VITE_APP_TITLE
const clicks = ref(0)

// ch11：组件级动态导入——点击后才下载 format 模块所在的 chunk
const formatResult = ref<string[]>([])

async function loadFormatModule() {
  const mod = await import('@/utils/format')
  formatResult.value = [
    `日期：${mod.formatDate(Date.now())}`,
    `slug：${mod.slugify('Vite Code Splitting')}`,
  ]
}

// ch10：调用本地插件提供的 mock 接口
const users = ref<Array<{ id: number; name: string; role: string }>>([])
const loading = ref(false)

async function loadUsers() {
  loading.value = true
  try {
    const res = await fetch('/api/mock/users')
    const data = (await res.json()) as { users: Array<{ id: number; name: string; role: string }> }
    users.value = data.users
  } finally {
    loading.value = false
  }
}

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
        <h2>依赖预构建</h2>
        <HelloWorld label="动态加载 format 模块" @click="loadFormatModule" />
        <ul v-if="formatResult.length" class="users">
          <li v-for="line in formatResult" :key="line">{{ line }}</li>
        </ul>
        <p class="muted">来自 dayjs（CJS）+ lodash-es（多文件 ESM）</p>
      </article>

      <article class="panel">
        <h2>CSS 工程化</h2>
        <p>CSS Modules 按钮（类名带哈希）：</p>
        <HelloWorld label="点我 +1" @click="clicks++" />
        <p class="muted">点击次数：{{ clicks }}</p>
      </article>

      <article class="panel">
        <h2>HMR 状态保留</h2>
        <Counter />
      </article>

      <article class="panel">
        <h2>自定义插件</h2>
        <p>虚拟模块：<code>virtual:app-info</code></p>
        <p class="muted">
          {{ appInfo.name }}@{{ appInfo.version }} · vite {{ appInfo.vite }}
        </p>
        <p class="muted">插件时间戳：{{ appInfo.builtAt }}</p>
        <HelloWorld label="请求 mock 接口" @click="loadUsers" />
        <p v-if="loading" class="muted">加载中…</p>
        <ul v-else-if="users.length" class="users">
          <li v-for="user in users" :key="user.id">{{ user.name }} · {{ user.role }}</li>
        </ul>
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

.users {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: #374151;
}
</style>
