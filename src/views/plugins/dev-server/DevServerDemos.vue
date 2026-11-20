<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

type DemoScenario = 'mock-api' | 'proxy-fallback' | 'debug-endpoints' | 'auth-upload'

const props = withDefaults(defineProps<{ scenario?: DemoScenario }>(), {
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

interface DebugConfig {
  mode: string
  pluginNames: string[]
  server: { port: number; strictPort: boolean }
}

const debugConfig = ref<DebugConfig | null>(null)
const debugResult = ref('')
const debugError = ref('')

async function loadDebugConfig() {
  debugError.value = ''
  try {
    const response = await fetch('/api/lab/debug/config')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    debugConfig.value = (await response.json()) as DebugConfig
  } catch (error) {
    debugError.value = error instanceof Error ? error.message : String(error)
  }
}

async function clearModuleCache() {
  debugError.value = ''
  try {
    const response = await fetch('/api/lab/debug/clear-cache', { method: 'POST' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = (await response.json()) as { invalidatedModules: number; fullReload: boolean }
    debugResult.value = `已失效 ${result.invalidatedModules} 个模块，full-reload 已发送。`
  } catch (error) {
    debugError.value = error instanceof Error ? error.message : String(error)
  }
}

interface SessionUser {
  id: string
  name: string
}

interface UploadResult {
  name: string
  size: number
  sha256: string
}

const sessionUser = ref<SessionUser | null>(null)
const authError = ref('')
const uploadResult = ref<UploadResult | null>(null)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

async function loadSession() {
  authError.value = ''
  try {
    const response = await fetch('/api/lab/auth/session')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as { authenticated: boolean; user: SessionUser | null }
    sessionUser.value = data.user
  } catch (error) {
    authError.value = error instanceof Error ? error.message : String(error)
  }
}

function startTeachingLogin() {
  window.location.assign('/api/lab/auth/sso/callback?code=vite-lab-teaching-code')
}

async function uploadFile() {
  const file = fileInput.value?.files?.[0]
  uploadResult.value = null
  uploadError.value = ''
  if (!file) {
    uploadError.value = '请先选择文件。'
    return
  }

  uploading.value = true
  try {
    const response = await fetch(`/api/lab/auth/upload?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    const data = (await response.json()) as UploadResult & { error?: string; maxBytes?: number }
    if (!response.ok) {
      throw new Error(
        data.error === 'file_too_large'
          ? `文件超过 ${data.maxBytes} 字节限制。`
          : `上传失败：${data.error ?? response.status}`,
      )
    }
    uploadResult.value = data
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    uploading.value = false
  }
}

onMounted(() => {
  if (props.scenario === 'auth-upload') void loadSession()
})
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

    <article v-else-if="scenario === 'debug-endpoints'" class="panel">
      <p class="eyebrow">16 · 白名单诊断与模块失效</p>
      <h1>Debug endpoints</h1>
      <p>配置响应只包含安全字段；清缓存会使模块失效并刷新当前页面。</p>
      <div class="actions">
        <button type="button" @click="loadDebugConfig">查看安全运行配置</button>
        <button type="button" @click="clearModuleCache">清缓存并刷新</button>
      </div>
      <p v-if="debugError" class="error" role="alert">{{ debugError }}</p>
      <p v-if="debugResult" data-testid="debug-result">{{ debugResult }}</p>
      <pre v-if="debugConfig" class="result" data-testid="debug-config">{{ JSON.stringify(debugConfig, null, 2) }}</pre>
    </article>

    <article v-else-if="scenario === 'auth-upload'" class="panel">
      <p class="eyebrow">17 · 仅用于本地教学的会话与上传</p>
      <h1>SSO callback + raw upload</h1>
      <p>固定教学 code 创建内存会话；上传原始字节限制为 64 KiB，不写磁盘。</p>
      <div class="actions">
        <button type="button" @click="startTeachingLogin">模拟 SSO 登录</button>
        <button type="button" @click="loadSession">查询当前用户</button>
      </div>
      <p data-testid="session-user">
        {{ sessionUser ? `当前用户：${sessionUser.name}（${sessionUser.id}）` : '当前未登录' }}
      </p>
      <p v-if="authError" class="error" role="alert">{{ authError }}</p>
      <div class="upload-row">
        <input ref="fileInput" type="file" aria-label="选择要上传的小文件" />
        <button type="button" :disabled="uploading" @click="uploadFile">
          {{ uploading ? '上传中…' : '上传原始字节' }}
        </button>
      </div>
      <p v-if="uploadError" class="error" role="alert">{{ uploadError }}</p>
      <pre v-if="uploadResult" class="result" data-testid="upload-result">{{ JSON.stringify(uploadResult, null, 2) }}</pre>
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

.upload-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
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
