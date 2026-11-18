<script setup lang="ts">
// ch08：四种静态资源导入方式
import bigPng from '@/assets/big.png'
import smallPng from '@/assets/small.png'
import logoUrl from '@/assets/logo.svg?url'
import logoInline from '@/assets/logo.svg?inline'
import noteRaw from '@/assets/note.txt?raw'

// new URL 写法：适合「路径在运行时才确定」的场景（例如 Worker、动态资源）
const dynamicSmall = new URL('../assets/small.png', import.meta.url).href

// public 目录：不经过打包，直接以根路径访问
const publicNotes = '/data/notes.json'
</script>

<template>
  <section>
    <h1>静态资源处理</h1>
    <p class="lead">同样的图片/文本，用不同方式导入，产物行为完全不同。</p>

    <div class="grid">
      <article class="panel">
        <h2>src/assets + 默认导入</h2>
        <img :src="bigPng" alt="big" class="big" />
        <p class="muted">big.png（&gt; 4KB）：独立文件 + hash 文件名</p>
      </article>

      <article class="panel">
        <h2>小文件自动内联</h2>
        <img :src="smallPng" alt="small" class="small" />
        <p class="muted">small.png（&lt; 4KB）：被转成 base64 data URL</p>
      </article>

      <article class="panel">
        <h2>SVG 的两种导入</h2>
        <img :src="logoUrl" alt="logo url" class="logo" />
        <p class="muted"><code>?url</code>：返回 URL</p>
        <img :src="logoInline" alt="logo inline" class="logo" />
        <p class="muted"><code>?inline</code>：返回 data URI</p>
      </article>

      <article class="panel">
        <h2>new URL 与 public</h2>
        <img :src="dynamicSmall" alt="dynamic" class="small" />
        <p class="muted"><code>new URL(..., import.meta.url)</code>：{{ dynamicSmall.slice(0, 48) }}…</p>
        <p>
          public 资源：
          <a :href="publicNotes" target="_blank" rel="noreferrer">/data/notes.json</a>
        </p>
      </article>
    </div>

    <h2 class="section-title">?raw 导入的文本</h2>
    <pre class="raw">{{ noteRaw }}</pre>
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
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.panel {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}

.panel h2 {
  margin: 0 0 12px;
  font-size: 15px;
}

.big {
  width: 100%;
  border-radius: 8px;
}

.small {
  image-rendering: pixelated;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.logo {
  width: 40px;
  height: 40px;
  margin-right: 8px;
}

.muted {
  margin: 6px 0;
  color: var(--muted);
  font-size: 12px;
}

.section-title {
  margin: 24px 0 8px;
  font-size: 16px;
}

.raw {
  margin: 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
