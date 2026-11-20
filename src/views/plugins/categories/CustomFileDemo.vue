<script setup lang="ts">
import MarkdownArticle from '@/plugin-lab/fixtures/custom-files/lesson.md'
import {
  document as queryDocument,
  operationName,
} from '@/plugin-lab/fixtures/custom-files/viewer.graphql'
import {
  headers,
  rows,
} from '@/plugin-lab/fixtures/custom-files/team.csv'
</script>

<template>
  <section>
    <h1>自定义文件类型</h1>
    <p class="lead">
      同一个页面导入三种非 JS 文件：Markdown 编译成 Vue 组件，GraphQL 变成文档模块，CSV 变成带表头的数据行。
    </p>
    <p class="links">
      <a href="/__inspect/" target="_blank" rel="noreferrer">在 Inspect 中查看转换</a>
      <a
        href="http://localhost:5174/plugins/custom-files/01-custom-file-types"
        target="_blank"
        rel="noreferrer"
      >阅读开发指南</a>
    </p>

    <article class="panel markdown-panel">
      <div class="panel-heading">
        <h2>Markdown → Vue 组件</h2>
        <code>lesson.md</code>
      </div>
      <MarkdownArticle class="markdown-preview" />
    </article>

    <article class="panel">
      <div class="panel-heading">
        <h2>GraphQL → 文档模块</h2>
        <code>viewer.graphql</code>
      </div>
      <p>operationName：<code data-testid="operation-name">{{ operationName ?? '匿名操作' }}</code></p>
      <pre class="query"><code>{{ queryDocument }}</code></pre>
      <p class="muted">这里只导出文档字符串，不发起 GraphQL 请求。</p>
    </article>

    <article class="panel">
      <div class="panel-heading">
        <h2>CSV → 数据模块</h2>
        <code>team.csv</code>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th v-for="header in headers" :key="header">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.name">
              <td v-for="header in headers" :key="header">{{ row[header] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted">引号中的逗号与双引号已由受控 CSV 解析器还原。</p>
    </article>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.lead {
  margin: 0 0 12px;
  color: #4b5563;
}

.links {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

a {
  color: #2563eb;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.panel {
  margin-top: 16px;
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
}

.panel h2 {
  margin: 0;
  font-size: 17px;
}

.panel-heading > code,
.muted {
  color: #6b7280;
  font-size: 13px;
}

.markdown-preview {
  padding-top: 4px;
}

.markdown-preview :deep(h1) {
  margin: 16px 0 8px;
  font-size: 23px;
}

.markdown-preview :deep(h2),
.markdown-preview :deep(h3) {
  margin: 18px 0 8px;
  font-size: 17px;
}

.markdown-preview :deep(p),
.markdown-preview :deep(li) {
  font-size: 14px;
  line-height: 1.7;
}

.markdown-preview :deep(pre),
.query {
  overflow-x: auto;
  padding: 12px;
  border-radius: 8px;
  background: #111827;
  color: #e5e7eb;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.table-scroll {
  overflow-x: auto;
  margin-top: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th,
td {
  padding: 9px 12px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}

th {
  background: #f9fafb;
}
</style>
