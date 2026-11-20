# 11. 注入 CSP meta、主题变量与首屏骨架

## 真实场景

HTML 入口通常需要集中承载安全策略、全局主题变量和 JavaScript 启动前的占位 UI。插件可以把这些横切能力放在同一处维护，避免每个页面复制整段 `<head>` 和骨架标记。

本例包含三类注入：不阻断页面的 Report-Only CSP、两个主题 CSS 变量，以及放在 `#app` 内、会被 `app.mount('#app')` 替换的最小骨架。

## 核心钩子与数据流

`transformIndexHtml` 同时支持两种操作：

```text
原始 HTML
  ├─ 字符串替换空 #app → 写入 skeletonMarkup
  └─ tags 数组
       ├─ meta[Content-Security-Policy-Report-Only]
       └─ style（主题变量 + 骨架样式）
  → 浏览器先绘制骨架
  → Vue 执行 app.mount('#app')
  → #app 初始内容被组件树替换，骨架不再存在
```

骨架必须位于挂载点 **内部**。若把它放在 `#app` 外部，Vue 不会负责移除，就需要额外的清理时机和错误处理。

## 最小实现

源码位于 `plugins/html/inject-head-assets.ts`。安全策略采用 `Content-Security-Policy-Report-Only`，只报告违规而不阻断资源：

```ts
const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')
```

`object-src 'none'` 禁止插件对象，`base-uri 'self'` 限制 `<base>`。其余指令允许当前同源资源以及开发链路需要的 inline、eval、Blob 和 WebSocket。没有配置外部报告地址，因此教学验证不会向外发送 CSP 报告。

主题和骨架样式通过 `style` 描述符注入，骨架则通过有限、明确的挂载点替换写入：

```ts
return {
  html: html.replace(
    '<div id="app"></div>',
    `<div id="app">${skeletonMarkup}</div>`,
  ),
  tags: headTags,
}
```

这里故意只处理本项目的精确挂载点，不尝试用正则解析通用 HTML。

## 配置接入

`plugins/html/index.ts` 将 `injectHeadAssets()` 追加到本分类插件数组。它和脚本注入插件都使用 `transformIndexHtml`，Vite 会按插件顺序执行并汇总标签，不需要改动共享 `vite.config.ts`。

示例页读取 CSP meta 的实际 `content`，通过 `getComputedStyle` 展示 `--plugin-lab-accent` 与背景色，并在 `onMounted` 后检查 `#plugin-lab-skeleton` 是否还存在。

## 验证步骤

1. 启动 `pnpm exec vite --port 5214`，打开 `http://localhost:5214/plugins/html-injection` 的“CSP、主题与首屏骨架”面板。
2. 确认页面展示 Report-Only meta 内容、主题变量 `#6d28d9` 和对应计算背景色，骨架状态为“已被 Vue mount 替换”。控制台不应出现 CSP 导致的 `Refused to load/execute` 阻断错误。
3. 要观察短暂骨架：在 DevTools Network 中勾选 **Disable cache**，选择 **Slow 3G** 等节流配置后刷新；在 Elements 或 Performance 录屏中观察 `#plugin-lab-skeleton`，随后确认 Vue 挂载后它消失。也可以先停用 JavaScript，再查看静态骨架。
4. 请求 `curl http://localhost:5214/`，在开发 HTML 中确认 CSP、主题 style 和 `#app` 内骨架均存在。
5. 执行 `pnpm build`，检查 `dist/index.html` 同时包含三类内容，且骨架位于 `#app` 内。
6. 执行 `pnpm docs:build` 和 `git diff --check`。

## 为什么 dev CSP 不能照搬生产策略

开发服务器可能需要 inline 脚本或样式、eval 形式的开发辅助代码、Blob Worker，以及用于 HMR 的 `ws:`/`wss:` 连接；Devtools 还可能增加自己的客户端资源。直接套用严格生产 CSP 往往会让 Vite 客户端无法启动。生产环境应根据真实资源清单收紧指令，去掉不需要的 `unsafe-eval` 与宽泛连接源，并优先使用 nonce/hash 和 HTTP 响应头。

Report-Only 适合观察和灰度，**不是强制防护**。正式上线还需配置经过审查的 enforcing CSP、报告收集与告警，并注意 `frame-ancestors` 等指令不能通过 meta 生效，必须使用响应头。

## 生产级实现还需补齐

- 按入口、部署环境和实际资源域名生成最小 CSP，验证第三方 SDK 更新不会引入未知源。
- 使用 HTTP Header、nonce/hash、报告去重与隐私控制，避免把 Report-Only 当成最终防线。
- 主题变量纳入设计 token 体系，考虑暗色模式、租户覆盖、SSR 水合与 FOUC。
- 骨架与真实页面布局匹配；处理启动失败、超时、减少动态效果偏好和可访问性，避免骨架无限停留。

## 常见坑

- 把 `Content-Security-Policy-Report-Only` 写成 `Content-Security-Policy`，导致开发资源被直接阻断。
- 把骨架放在 `#app` 外，误以为 Vue 会自动清除。
- 用宽泛正则替换任意 `<div>`，误改其他挂载点或脚本字符串。
- 只检查构建 HTML 有骨架，却不检查运行时是否残留；两个方向都需要验证。

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
