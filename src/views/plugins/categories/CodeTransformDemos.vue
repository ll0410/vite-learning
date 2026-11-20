<!-- lab:inject-tracking -->
<script setup lang="ts">
import '@/plugin-lab/fixtures/code-transform/strip-debug-fixture'
import { trackingEvents } from '@/plugin-lab/tracking'

const docsBase = 'http://localhost:5174'
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
