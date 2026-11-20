<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

withDefaults(defineProps<{ scenario?: 'mock-api' | 'proxy-fallback' }>(), {
  scenario: 'mock-api',
})

interface MockUser {
  id: number
  name: string
  role: string
}

const users = ref<MockUser[]>([])
const mockError = ref('')

async function loadUsers() {
  mockError.value = ''
  try {
    const response = await fetch('/api/mock/users')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as { users: MockUser[] }
    users.value = data.users
  } catch (error) {
    mockError.value = error instanceof Error ? error.message : String(error)
  }
}

interface ProxyResult {
  source: 'primary' | 'fallback'
  message: string
  reason?: string
}

const proxyResult = ref<ProxyResult | null>(null)
const proxyError = ref('')
const proxyLoading = ref(false)

async function requestProxy(mode: 'success' | 'http-error' | 'network-error') {
  proxyLoading.value = true
  proxyError.value = ''
  try {
    const response = await fetch(`/api/lab/proxy/resource?mode=${mode}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    proxyResult.value = (await response.json()) as ProxyResult
  } catch (error) {
    proxyError.value = error instanceof Error ? error.message : String(error)
  } finally {
    proxyLoading.value = false
  }
}
</script>

<template>
  <section class="demo-page">
    <RouterLink class="back-link" to="/plugins">← 返回插件实验室</RouterLink>

    <article v-if="scenario === 'mock-api'" class="panel">
      <p class="eyebrow">14 · configureServer</p>
      <h1>Mock API</h1>
      <p>
        复用 ch10 的 <code>plugins/mock-api.ts</code>，由开发服务器直接返回三个确定性用户。
      </p>
      <button type="button" @click="loadUsers">加载三个用户</button>
      <p v-if="mockError" class="error" role="alert">{{ mockError }}</p>
      <ul v-if="users.length" class="users" data-testid="mock-users">
        <li v-for="user in users" :key="user.id">
          {{ user.name }} · {{ user.role }}
        </li>
      </ul>
    </article>

    <article v-else-if="scenario === 'proxy-fallback'" class="panel">
      <p class="eyebrow">15 · 本地转发与错误兜底</p>
      <h1>Proxy fallback</h1>
      <p>转发目标使用 dev server 的实际监听端口。选择场景后观察响应来源。</p>
      <div class="actions">
        <button type="button" :disabled="proxyLoading" @click="requestProxy('success')">
          主接口成功
        </button>
        <button type="button" :disabled="proxyLoading" @click="requestProxy('http-error')">
          模拟主接口失败
        </button>
        <button type="button" :disabled="proxyLoading" @click="requestProxy('network-error')">
          模拟网络错误
        </button>
      </div>
      <p v-if="proxyError" class="error" role="alert">{{ proxyError }}</p>
      <pre v-if="proxyResult" class="result" data-testid="proxy-result">{{ JSON.stringify(proxyResult, null, 2) }}</pre>
    </article>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 860px;
  margin: 0 auto;
}

.back-link {
  display: inline-block;
  margin-bottom: 16px;
  color: #2563eb;
  text-decoration: none;
}

.panel {
  padding: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.eyebrow {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

h1 {
  margin: 4px 0 12px;
  font-size: 26px;
}

button {
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}

button:hover {
  background: #1d4ed8;
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.result {
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: #f3f4f6;
  font-size: 13px;
}

.users {
  margin: 16px 0 0;
  padding-left: 20px;
}

.error {
  color: #b91c1c;
}
</style>
