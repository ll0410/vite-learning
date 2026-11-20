<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getUsers, type GeneratedUser } from 'virtual:generated-api'
import generatedRoutes from 'virtual:generated-routes'
import messages from 'virtual:generated-i18n'
import appInfo from 'virtual:app-info'
import rocketPath from 'virtual:on-demand-data/icons/rocket'
import bookPath from 'virtual:on-demand-data/icons/book'
import viteDefinition from 'virtual:on-demand-data/dictionary/vite'
import pluginDefinition from 'virtual:on-demand-data/dictionary/plugin'

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

const iconEntries = [
  { key: 'rocket', label: '火箭', path: rocketPath },
  { key: 'book', label: '文档', path: bookPath },
]
const dictionaryEntries = [
  { key: 'vite', definition: viteDefinition },
  { key: 'plugin', definition: pluginDefinition },
]
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

    <section id="build-constants" class="demo-section">
      <h2>2. 编译期常量：版本、时间、Git commit 与环境</h2>
      <article class="panel">
        <table>
          <tbody>
            <tr><th>name</th><td>{{ appInfo.name }}</td></tr>
            <tr><th>version</th><td>{{ appInfo.version }}</td></tr>
            <tr><th>vite</th><td>{{ appInfo.vite }}</td></tr>
            <tr><th>builtAt</th><td><time :datetime="appInfo.builtAt">{{ appInfo.builtAt }}</time></td></tr>
            <tr><th>gitCommit</th><td><code>{{ appInfo.gitCommit }}</code></td></tr>
            <tr><th>mode</th><td><code>{{ appInfo.mode }}</code></td></tr>
          </tbody>
        </table>
        <p class="muted">以上值由 virtual:app-info 在配置解析和模块加载阶段生成，不读取浏览器时间。</p>
      </article>
    </section>

    <section id="auto-discovery" class="demo-section">
      <h2>3. 组件自动注册、目录约定式路由</h2>
      <article class="panel">
        <h3>无手写 import 的全局组件</h3>
        <LabAutoBadge label="LabAutoBadge 来自 src/components/auto，由 setup 自动注册" />
        <p class="muted">本模板只写组件标签，注册代码在 virtual:auto-components 中生成。</p>
      </article>
      <article class="panel route-panel">
        <h3>可实际导航和刷新的页面</h3>
        <nav>
          <RouterLink to="/conventional">/conventional</RouterLink>
          <RouterLink to="/conventional/about">/conventional/about</RouterLink>
          <RouterLink to="/conventional/users/42">/conventional/users/42</RouterLink>
        </nav>
        <p class="muted">页面来自 src/views/conventional，动态 import 会形成独立页面 chunk。</p>
      </article>
    </section>

    <section id="on-demand-data" class="demo-section">
      <h2>4. 大体积静态数据按需导出</h2>
      <div class="grid">
        <article class="panel">
          <h3>只请求 rocket 与 book 图标</h3>
          <ul class="icon-list">
            <li v-for="icon in iconEntries" :key="icon.key">
              <svg viewBox="0 0 24 24" :aria-label="icon.label" role="img">
                <path :d="icon.path" />
              </svg>
              <span>{{ icon.label }}</span>
              <code>icons/{{ icon.key }}</code>
            </li>
          </ul>
        </article>
        <article class="panel">
          <h3>只请求两个词条</h3>
          <dl>
            <template v-for="entry in dictionaryEntries" :key="entry.key">
              <dt><code>dictionary/{{ entry.key }}</code></dt>
              <dd>{{ entry.definition }}</dd>
            </template>
          </dl>
        </article>
      </div>
      <p class="hint">源 JSON 含 UNUSED_*_SENTINEL_DO_NOT_BUNDLE；它不应出现在这些 load 结果或生产 JS 中。</p>
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

.route-panel nav {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.icon-list {
  display: flex;
  gap: 24px;
  padding: 0;
  list-style: none;
}

.icon-list li {
  display: grid;
  justify-items: center;
  gap: 6px;
}

.icon-list svg {
  width: 48px;
  height: 48px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}

dt {
  margin-top: 10px;
  font-weight: 600;
}

dd {
  margin: 4px 0 0;
}
</style>
