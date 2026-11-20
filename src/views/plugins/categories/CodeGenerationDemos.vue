<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getUsers, type GeneratedUser } from 'virtual:generated-api'
import generatedRoutes from 'virtual:generated-routes'
import messages from 'virtual:generated-i18n'

const users = ref<GeneratedUser[]>([])
const loading = ref(false)
const error = ref('')

async function loadUsers() {
  loading.value = true
  error.value = ''
  try {
    const response = await getUsers()
    users.value = response.users
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)

const locale = ref<keyof typeof messages>('zh-CN')
const currentMessages = computed(() => messages[locale.value])

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
}
</script>

<template>
  <div class="demos">
    <h1>代码生成 / 虚拟模块</h1>
    <p class="lead">每个示例都由本地教学插件生成，可结合 Inspect 查看 resolveId 与 load 的结果。</p>

    <section id="generated-modules" class="demo-section">
      <h2>1. 自动生成 API 客户端、路由表、i18n 资源聚合</h2>
      <div class="grid">
        <article class="panel">
          <h3>生成的用户 API</h3>
          <button type="button" :disabled="loading" @click="loadUsers">
            {{ loading ? '请求中…' : '重新调用 getUsers()' }}
          </button>
          <p v-if="error" class="error">{{ error }}</p>
          <ul v-else>
            <li v-for="user in users" :key="user.id">{{ user.name }} · {{ user.role }}</li>
          </ul>
          <code>virtual:generated-api</code>
        </article>

        <article class="panel">
          <h3>生成的路由记录数据</h3>
          <table>
            <thead>
              <tr><th>路径</th><th>名称</th><th>标题</th></tr>
            </thead>
            <tbody>
              <tr v-for="route in generatedRoutes" :key="route.name">
                <td><code>{{ route.path }}</code></td>
                <td>{{ route.name }}</td>
                <td>{{ route.title }}</td>
              </tr>
            </tbody>
          </table>
          <p class="muted">这里只生成数据；真实可导航路由见第 3 项。</p>
        </article>

        <article class="panel">
          <h3>{{ currentMessages.title }}</h3>
          <p class="message">{{ currentMessages.greeting }}</p>
          <button type="button" @click="toggleLocale">{{ currentMessages.switchLabel }}</button>
          <p><code>virtual:generated-i18n · {{ locale }}</code></p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demos {
  display: grid;
  gap: 24px;
}

h1 {
  margin: 0;
  font-size: 28px;
}

.lead,
.muted {
  color: #6b7280;
}

.lead {
  margin: 0;
}

.demo-section {
  scroll-margin-top: 20px;
}

.demo-section h2 {
  margin: 0 0 12px;
  font-size: 20px;
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

.panel h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

button {
  padding: 6px 12px;
  border: 0;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

ul {
  padding-left: 20px;
}

.message {
  font-size: 20px;
  font-weight: 600;
}

.error {
  color: #dc2626;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  padding: 6px;
  border-bottom: 1px solid #f3f4f6;
  text-align: left;
}
</style>
