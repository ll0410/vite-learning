// ch02：手写的最小入口，不依赖任何框架。
// ch03：改用 @ 别名引入工具模块，验证 resolve.alias。
import { add, multiply } from '@/utils/math'

const app = document.querySelector('#app')

const startedAt = new Date().toLocaleTimeString()

app.innerHTML = `
  <main class="card">
    <h1>Vite 一天动手实验室</h1>
    <p>如果你看到这张卡片，说明 <code>pnpm dev</code> 已经跑通了。</p>
    <ul>
      <li>运行模式：<b>${import.meta.env.MODE}</b>（DEV = ${import.meta.env.DEV}）</li>
      <li>页面渲染时间：${startedAt}</li>
      <li>别名验证：2 + 3 = <b>${add(2, 3)}</b>，2 × 3 = <b>${multiply(2, 3)}</b></li>
    </ul>
    <p class="hint">下一步：打开 DevTools 的 Network 面板，观察这个页面请求了哪些文件。</p>
  </main>
`

console.debug('[ch03] main.js executed, mode =', import.meta.env.MODE)
console.debug('[ch03] base url =', import.meta.env.BASE_URL)
