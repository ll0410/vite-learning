<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface HtmlScriptState {
  order: string[]
  loaded: Partial<Record<'cdn' | 'monitor' | 'analytics', boolean>>
}

const scriptState = (
  window as typeof window & {
    __pluginLabHtml?: HtmlScriptState
  }
).__pluginLabHtml

const loadOrder = scriptState?.order ?? []
const loadFlags = [
  { purpose: 'cdn', label: 'CDN', loaded: scriptState?.loaded.cdn === true },
  { purpose: 'monitor', label: '监控', loaded: scriptState?.loaded.monitor === true },
  { purpose: 'analytics', label: '统计', loaded: scriptState?.loaded.analytics === true },
]

const scriptTags = Array.from(
  document.querySelectorAll<HTMLScriptElement>('script[data-html-injection]'),
).map((script) => ({
  purpose: script.dataset.htmlInjection ?? '',
  src: script.getAttribute('src') ?? '',
  markup: `<script src="${script.getAttribute('src')}" data-html-injection="${script.dataset.htmlInjection}"><\/script>`,
}))

const cspContent = document.querySelector<HTMLMetaElement>(
  'meta[http-equiv="Content-Security-Policy-Report-Only"]',
)?.content ?? ''
const themeSample = ref<HTMLElement | null>(null)
const accentValue = ref('')
const surfaceValue = ref('')
const skeletonPresent = ref(false)

onMounted(() => {
  if (themeSample.value) {
    const styles = getComputedStyle(themeSample.value)
    accentValue.value = styles.getPropertyValue('--plugin-lab-accent').trim()
    surfaceValue.value = styles.backgroundColor
  }
  skeletonPresent.value = document.getElementById('plugin-lab-skeleton') !== null
})

const mainEntry = document.querySelector<HTMLMetaElement>('meta[name="plugin-lab-entry"]')?.content ?? ''
const mainEntryTitle = document.title
</script>

<template>
  <section>
    <h1>HTML 注入实验</h1>
    <p class="lead">直接观察 transformIndexHtml 写入开发页与构建 HTML 的标签及运行时结果。</p>

    <section id="inject-scripts" class="demo-panel">
      <p class="eyebrow">条目 10 · transformIndexHtml</p>
      <h2>本地 CDN、监控与统计脚本</h2>
      <p>三个文件均由当前 Vite 服务提供，不会连接真实第三方服务。</p>

      <h3>执行顺序</h3>
      <ol data-testid="script-load-order" class="load-order">
        <li v-for="purpose in loadOrder" :key="purpose" :data-purpose="purpose">{{ purpose }}</li>
      </ol>

      <h3>加载标记</h3>
      <ul data-testid="script-load-flags" class="flag-list">
        <li v-for="flag in loadFlags" :key="flag.purpose" :data-loaded="flag.loaded">
          {{ flag.label }}：<strong>{{ flag.loaded ? '已加载' : '未加载' }}</strong>
        </li>
      </ul>

      <h3>实际 script 标签</h3>
      <ul data-testid="script-tags" class="tag-list">
        <li v-for="tag in scriptTags" :key="tag.purpose" :data-purpose="tag.purpose">
          <code>{{ tag.markup }}</code>
        </li>
      </ul>
    </section>

    <section id="head-assets" class="demo-panel">
      <p class="eyebrow">条目 11 · head 与挂载点</p>
      <h2>CSP、主题与首屏骨架</h2>

      <h3>Report-Only CSP</h3>
      <p data-testid="csp-content" class="csp-content"><code>{{ cspContent }}</code></p>

      <h3>主题计算样式</h3>
      <div ref="themeSample" data-testid="theme-sample" class="theme-sample">
        这个色块使用注入的 --plugin-lab-accent-surface。
      </div>
      <p
        data-testid="theme-values"
        :data-accent="accentValue"
        :data-surface="surfaceValue"
        class="theme-values"
      >
        变量：<code>{{ accentValue }}</code>；计算背景色：<code>{{ surfaceValue }}</code>
      </p>

      <h3>挂载后的骨架状态</h3>
      <p data-testid="skeleton-state" :data-remaining="skeletonPresent">
        {{ skeletonPresent ? '骨架仍有残留' : '骨架已被 Vue mount 替换' }}
      </p>
      <p class="muted">静态 HTML 中可见骨架；组件树挂载后，此处确认它已消失。</p>
    </section>

    <section id="mpa-entry" class="demo-panel">
      <p class="eyebrow">条目 12 · config + transformIndexHtml</p>
      <h2>MPA 按入口注入标签</h2>
      <p data-testid="main-entry" :data-entry="mainEntry">
        当前主 SPA 标识：<strong>{{ mainEntry }}</strong>
      </p>
      <p data-testid="main-entry-title">当前标题：<code>{{ mainEntryTitle }}</code></p>
      <p>
        <a data-testid="admin-link" href="/admin.html" target="_blank" rel="noreferrer">
          打开 /admin.html 对比 Admin 入口
        </a>
      </p>
    </section>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.lead {
  margin: 0 0 24px;
  color: #6b7280;
}

.demo-panel {
  margin-top: 20px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  scroll-margin-top: 20px;
}

.demo-panel h2 {
  margin: 4px 0 8px;
  font-size: 20px;
}

.demo-panel h3 {
  margin: 20px 0 8px;
  font-size: 15px;
}

.eyebrow {
  margin: 0;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
}

.load-order,
.flag-list,
.tag-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 22px;
}

.load-order {
  display: flex;
  padding: 0;
  list-style-position: inside;
}

.load-order li {
  padding: 4px 10px;
  border-radius: 6px;
  background: #eff6ff;
  color: #1d4ed8;
}

.flag-list {
  padding: 0;
  list-style: none;
}

[data-loaded='true'] strong {
  color: #047857;
}

[data-loaded='false'] strong {
  color: #b91c1c;
}

.tag-list {
  padding: 0;
  list-style: none;
}

.tag-list code {
  display: block;
  overflow-wrap: anywhere;
}

.csp-content code {
  display: block;
  overflow-wrap: anywhere;
}

.theme-sample {
  padding: 16px;
  border-radius: 8px;
  background: var(--plugin-lab-accent-surface);
  color: var(--plugin-lab-accent);
  font-weight: 600;
}

.theme-values,
.muted {
  color: #6b7280;
  font-size: 14px;
}

[data-remaining='false'] {
  color: #047857;
}

[data-remaining='true'] {
  color: #b91c1c;
}
</style>
