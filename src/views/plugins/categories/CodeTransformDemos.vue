<!-- lab:inject-tracking -->
<script setup lang="ts">
import '@/plugin-lab/fixtures/code-transform/strip-debug-fixture'
import '@/plugin-lab/fixtures/code-transform/conditional-build-fixture'
import { trackingEvents } from '@/plugin-lab/tracking'

const docsBase = 'http://localhost:5174'
const tenant = {
  id: __TENANT_ID__,
  brand: __TENANT_BRAND__,
  theme: __TENANT_THEME__,
  betaPanel: __TENANT_BETA_PANEL__,
}
</script>

<template>
  <section>
    <h1>构建期代码改写 / 裁剪</h1>
    <p class="lead">通过受控源码观察 transform、define 与条件编译；构建专用条目以产物断言为准。</p>

    <article id="strip-debug" class="panel">
      <h2>5. 移除 console / debugger / 测试代码</h2>
      <p>
        本项不提供 dev 效果示例：插件声明了 <code>apply: 'build'</code>，dev 必须保留调试语句。
        请按指南检查 dev 源码和生产产物，而不是期待页面在 dev 中发生裁剪。
      </p>
      <pre><code>pnpm build</code></pre>
      <a :href="`${docsBase}/plugins/code-transform/01-strip-debug`" target="_blank" rel="noreferrer">
        阅读 strip-debug 指南与断言命令
      </a>
    </article>

    <article id="inject-tracking" class="panel">
      <h2>6. 组件挂载点埋点自动注入</h2>
      <p>
        此组件带有显式注入标记，但没有手写 <code>onMounted</code> 或 <code>track(...)</code> 调用。
        下列记录由插件注入的挂载回调自动产生：
      </p>
      <p class="event-count" data-testid="tracking-count">已记录 {{ trackingEvents.length }} 条挂载事件</p>
      <ul v-if="trackingEvents.length" class="events">
        <li v-for="(event, index) in trackingEvents" :key="index" data-testid="tracking-event">
          <code>{{ event.name }}</code>
          <time :datetime="event.occurredAt">{{ event.occurredAt }}</time>
        </li>
      </ul>
      <p v-else>等待组件挂载…</p>
      <a :href="`${docsBase}/plugins/code-transform/02-inject-tracking`" target="_blank" rel="noreferrer">
        阅读 inject-tracking 指南
      </a>
    </article>

    <article
      id="tenant-build"
      class="panel tenant-panel"
      :data-tenant="tenant.id"
      :data-theme="tenant.theme"
      :style="{ borderTopColor: tenant.theme }"
    >
      <h2>7. 多租户 / 多品牌差异化构建</h2>
      <p>当前值由 <code>TENANT</code> 选择公开 JSON，并在配置阶段通过 <code>define</code> 内联。</p>
      <h3 data-testid="tenant-brand">{{ tenant.brand }}</h3>
      <p>租户 ID：<code data-testid="tenant-id">{{ tenant.id }}</code></p>
      <p class="theme-row">
        主题色：<code data-testid="tenant-theme">{{ tenant.theme }}</code>
        <span class="theme-swatch" :style="{ backgroundColor: tenant.theme }" aria-label="租户主题色块" />
      </p>
      <p data-testid="tenant-beta">Beta 功能：{{ tenant.betaPanel ? '开启' : '关闭' }}</p>
      <p v-if="tenant.betaPanel" class="beta-feature" data-testid="tenant-beta-panel">
        Beta 专属公开功能面板
      </p>
      <pre><code>pnpm build
TENANT=beta pnpm build --outDir dist-beta</code></pre>
      <a :href="`${docsBase}/plugins/code-transform/03-tenant-build`" target="_blank" rel="noreferrer">
        阅读 tenant-build 指南与对照构建命令
      </a>
    </article>

    <article id="conditional-build" class="panel">
      <h2>8. 生产配置替换与条件编译</h2>
      <p>
        本项不提供 dev 效果示例：目标是比较 dev/prod 模块差异。插件只在 build 中替换公开
        URL/布尔占位符并删除显式 DEV_ONLY 块，dev 必须保留对照输入。
      </p>
      <pre><code>pnpm build</code></pre>
      <a :href="`${docsBase}/plugins/code-transform/04-conditional-build`" target="_blank" rel="noreferrer">
        阅读 conditional-build 指南与产物断言
      </a>
    </article>
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

.panel {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  scroll-margin-top: 20px;
}

.panel h2 {
  margin: 0 0 12px;
  font-size: 18px;
}

.panel p {
  color: #4b5563;
  font-size: 14px;
  line-height: 1.7;
}

.tenant-panel {
  border-top: 4px solid;
}

.tenant-panel h3 {
  margin-bottom: 8px;
}

.theme-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-swatch {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.beta-feature {
  padding: 8px;
  border-radius: 6px;
  background: #fff7ed;
  color: #9a3412 !important;
}

.event-count {
  font-weight: 600;
}

.events {
  display: grid;
  gap: 8px;
  padding-left: 20px;
  color: #374151;
  font-size: 13px;
}

.events time {
  margin-left: 8px;
  color: #6b7280;
}

pre {
  overflow-x: auto;
  padding: 12px;
  border-radius: 8px;
  background: #111827;
  color: #f9fafb;
  font-size: 13px;
}

a {
  color: #2563eb;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
</style>
