// ch02：手写的最小入口。
// ch03：用 @ 别名引入工具模块，验证 resolve.alias。
// ch04：把 import.meta.env 渲染出来，观察环境变量注入。
import { add, multiply } from '@/utils/math'

const app = document.querySelector('#app')

const startedAt = new Date().toLocaleTimeString()

// 只保留 VITE_ 前缀与 Vite 内置变量，避免把整份 env 打印出来
const envRows = Object.entries(import.meta.env)
  .filter(([key]) => key.startsWith('VITE_') || ['MODE', 'DEV', 'PROD', 'BASE_URL'].includes(key))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `<tr><td><code>${key}</code></td><td>${String(value)}</td></tr>`)
  .join('')

app.innerHTML = `
  <main class="card">
    <h1>${import.meta.env.VITE_APP_TITLE}</h1>
    <p>如果你看到这张卡片，说明 <code>pnpm dev</code> 已经跑通了。</p>
    <ul>
      <li>运行模式：<b>${import.meta.env.MODE}</b>（DEV = ${import.meta.env.DEV}）</li>
      <li>页面渲染时间：${startedAt}</li>
      <li>别名验证：2 + 3 = <b>${add(2, 3)}</b>，2 × 3 = <b>${multiply(2, 3)}</b></li>
    </ul>

    <h2>import.meta.env</h2>
    <table class="env-table">
      <thead><tr><th>变量</th><th>值</th></tr></thead>
      <tbody>${envRows}</tbody>
    </table>

    <p class="hint">
      试试 <code>pnpm build:staging</code> 后执行 <code>pnpm preview</code>，观察标题与 API 地址的变化。
    </p>
  </main>
`

console.table(import.meta.env)
console.debug('[ch04] main.js executed, mode =', import.meta.env.MODE)
console.debug('[ch04] base url =', import.meta.env.BASE_URL)
