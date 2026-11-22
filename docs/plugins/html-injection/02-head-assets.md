# 11. 注入 CSP meta、主题变量与首屏骨架

安全策略、主题变量和加载占位看似是三件事，其实都要在 Vue 应用启动前准备好。本例用一个 Vite 插件集中处理它们，同时保留原始 `index.html` 的简洁结构。

一句话概括：**插件先把静态 HTML 改成“有安全策略、有主题样式、有加载占位”的页面；浏览器拿到它后可以绘制骨架，随后 Vue 挂载组件树并替换骨架，示例页再从真实 DOM（浏览器中的文档节点树）和计算样式（浏览器综合 CSS 后得到的最终样式）中读回结果。**

这里涉及两个先需要说清的术语：

- **内容安全策略（Content Security Policy，CSP）**：告诉浏览器允许加载或执行哪些资源。本例使用 **Report-Only（仅报告）** 模式观察策略，不把它当作强制防护。
- **首屏骨架**：真实组件出现前，先放在页面里的静态占位结构。它不是服务端渲染出来的完整页面。

::: tip 现成方案速览
- **官方 / 成熟方案**：静态 CSP meta、主题变量和首屏骨架用 `transformIndexHtml` 注入；Vite 还提供 [`html.cspNonce`](https://vite.dev/config/shared-options.html#html-cspnonce)。需要完整 CSP 策略时可评估 [`vite-plugin-csp-guard`](https://github.com/tsotimus/vite-plugin-csp-guard)（声明支持 Vite 8，SPA 定位）。
- **覆盖程度**：**部分覆盖**。
- **本例定位**：教学用最小实现，重点是理解多段 HTML 注入的先后顺序，以及为什么主题和骨架要保持最小。
- **值得自研的时机**：主题体系与骨架内容属于业务；CSP 生产环境建议用 HTTP Header 配合专用方案。
:::

## 第一个完整示例：页面从 HTML 到组件树经历了什么

整条链路如下。`transformIndexHtml` 是 Vite 的 HTML 转换钩子，也就是插件接收 HTML 字符串并返回修改结果的位置。注意，注入结果与 Vue 挂载结果是两个连续但不同的阶段。

```text
原始 index.html：空的 #app
        ↓
transformIndexHtml 同时返回改写后的 html 与 head tags
        ↓
Report-Only meta + 主题 style + #app 内的静态骨架
        ↓
浏览器解析 HTML，并可在应用启动前先绘制骨架
        ↓
src/main.ts 执行 app.mount('#app')，组件树替换骨架
        ↓
演示组件读取 meta、计算样式和骨架是否仍存在
```

### 1. 输入：原始 HTML 中只有空的挂载点

根目录 `index.html` 的相关代码如下。这里省略 `<head>` 和 `<body>` 外层标签；`#app` 是 Vue 组件树的挂载点，也就是组件树要插入的位置。

```html
<div id="app"></div>
<!-- ch05：入口从 main.js 换成 main.ts -->
<script type="module" src="/src/main.ts"></script>
```

此时 `#app` 内没有任何内容。若应用脚本尚未下载或执行，浏览器自然也没有骨架可以显示。

### 2. 转换：同一个钩子返回 `html` 和 `tags`

`plugins/html/inject-head-assets.ts` 在这个钩子中同时给出改写后的 HTML 和标签描述。本例的核心返回值与源码一致：

```ts
transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
  return {
    // 骨架先放入挂载点，Vue 挂载后会替换它。
    html: html.replace(
      '<div id="app"></div>',
      `<div id="app">${skeletonMarkup}</div>`,
    ),
    tags: headTags,
  }
}
```

两个字段不是二选一，而是在同一次转换中分工合作：

- `html` 接回原 HTML 字符串。本例只把空的 `#app` 换成内部带骨架的 `#app`。
- `tags` 接收标签描述对象。Vite 根据描述把 meta 和 style 序列化到 `<head>`，不需要插件手工查找 `</head>` 再拼字符串。

### 3. 转换结果：head 有策略和样式，挂载点内有骨架

骨架本身是一段普通静态 HTML。下面的 `skeletonMarkup` 是完整源码：

```ts
const skeletonMarkup = [
  '<div id="plugin-lab-skeleton" data-html-injection="skeleton" role="status" aria-label="页面加载中">',
  '<div class="plugin-lab-skeleton-title"></div>',
  '<div class="plugin-lab-skeleton-line"></div>',
  '<div class="plugin-lab-skeleton-line"></div>',
  '</div>',
].join('')
```

因此，字符串替换后的关键结构是：

```html
<div id="app"><div id="plugin-lab-skeleton" data-html-injection="skeleton" role="status" aria-label="页面加载中"><div class="plugin-lab-skeleton-title"></div><div class="plugin-lab-skeleton-line"></div><div class="plugin-lab-skeleton-line"></div></div></div>
```

CSP 的完整指令来自下面的数组。`join('; ')` 会把它们连成 meta 的 `content` 值。

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

`headTags` 中有两个描述对象。下面保留 meta、主题变量、骨架容器和减少动态效果的源码，省略骨架标题、占位条与关键帧的样式定义：

```ts
const headTags: HtmlTagDescriptor[] = [
  {
    tag: 'meta',
    attrs: {
      'http-equiv': 'Content-Security-Policy-Report-Only',
      content: reportOnlyCsp,
      'data-html-injection': 'csp',
    },
    injectTo: 'head',
  },
  {
    tag: 'style',
    attrs: { 'data-html-injection': 'theme' },
    children: `
      :root {
        --plugin-lab-accent: #6d28d9;
        --plugin-lab-accent-surface: #f5f3ff;
      }
      #plugin-lab-skeleton {
        margin: 24px;
        padding: 20px;
        border-radius: 12px;
        background: var(--plugin-lab-accent-surface);
        animation: plugin-lab-skeleton-pulse 1s ease-in-out infinite alternate;
      }
      /* ……省略骨架标题、占位条与关键帧样式…… */
      @media (prefers-reduced-motion: reduce) {
        #plugin-lab-skeleton { animation: none; }
      }
    `,
    injectTo: 'head',
  },
]
```

到这里，插件已经同时交付三项可观察结果：

| 结果 | 所在位置 | 用于识别的属性或值 |
| --- | --- | --- |
| Report-Only CSP meta | `<head>` | `http-equiv="Content-Security-Policy-Report-Only"`、`data-html-injection="csp"` |
| 主题与骨架 style | `<head>` | `data-html-injection="theme"`、`--plugin-lab-accent: #6d28d9`、`--plugin-lab-accent-surface: #f5f3ff` |
| 静态骨架 | `#app` 内部 | `id="plugin-lab-skeleton"`、`data-html-injection="skeleton"` |

转换只作用于开发服务器内存中的 HTML 或构建产物，**不会回写根目录的 `index.html` 源文件**。

### 4. 浏览器启动前：已经有可绘制的静态内容

浏览器收到转换后的 HTML 后，在 `/src/main.ts` 执行前就能解析 head 中的 meta 和 style，也能解析 `#app` 内的骨架。因此，在应用脚本下载和初始化期间，浏览器已经具备先绘制占位的条件；如果挂载前还有其他准备工作，骨架也能继续作为占位。

这不等于所有设备上都一定能肉眼看到骨架。本机缓存充足、应用启动很快时，它可能只存在很短时间；后文的验证会使用节流和 Performance 录屏观察这个过程，而不是承诺每次刷新都有明显闪烁。

### 5. Vue 挂载：组件树替换 `#app` 的初始内容

`src/main.ts` 在完成路由和示例安装后执行挂载，相关源码为：

```ts
const app = createApp(App)
app.use(router)
setupPluginLab(app)
app.mount('#app')
```

`app.mount('#app')` 会用 `App` 组件树替换挂载点原有内容，于是 `#plugin-lab-skeleton` 随初始内容一起被移除。可以把前后关系简化为：

```text
挂载前：#app
        └─ #plugin-lab-skeleton

挂载后：#app
        └─ App 组件树
           └─ RouterView 渲染的页面
```

骨架消失表示根 Vue 应用已经挂载，**不代表所有异步路由、请求或业务数据都已完成加载**。

### 6. 页面读取结果：验证的是浏览器实际拿到的东西

`src/plugin-lab/routes/html-injection.ts` 把 `/plugins/html-injection` 指向 `HtmlInjectionDemos.vue`。该组件不是导入插件里的常量来展示，而是读取当前文档的 meta、元素的计算样式，以及骨架 DOM 是否还存在：

```ts
// ……省略其他演示代码……
const cspContent = document.querySelector<HTMLMetaElement>(
  'meta[http-equiv="Content-Security-Policy-Report-Only"]',
)?.content ?? ''

onMounted(() => {
  if (themeSample.value) {
    const styles = getComputedStyle(themeSample.value)
    accentValue.value = styles.getPropertyValue('--plugin-lab-accent').trim()
    surfaceValue.value = styles.backgroundColor
  }
  skeletonPresent.value = document.getElementById('plugin-lab-skeleton') !== null
})
// ……省略其他演示代码……
```

这一步把原理和页面结果连了起来：

- meta 内容能被读到，说明 `tags` 确实进入了当前文档，而不只是存在于插件源码中。
- `getComputedStyle` 能读到 `#6d28d9` 和背景色，说明注入的 CSS 变量已参与真实样式计算。
- `onMounted` 后找不到 `#plugin-lab-skeleton`，与 Vue 挂载替换初始内容的过程相互印证。

## 看懂实现中的四个关键选择

### 为什么骨架必须放在挂载点内部

Vue 负责替换的是 `#app` **内部**的初始内容。骨架放在这里，正常挂载后就会消失，不需要另一段清理代码。

如果把骨架放到 `#app` 外部，Vue 不会负责移除它。此时必须额外决定由谁清理、何时清理，以及应用启动失败时显示什么。本例刻意使用挂载点替换这条简单链路，没有实现额外的骨架管理机制。

### 为什么 Report-Only 不阻断资源

`Content-Security-Policy-Report-Only` 用于观察“如果采用这条策略，哪些行为会违规”。它与会实际拦截资源的 `Content-Security-Policy` 不同：前者是仅报告，后者才是 enforcing（强制执行）策略。

因此，即使控制台出现带有 `[Report Only]` 的违规信息，也不能据此断定资源已经被这条策略拦截，应继续检查资源是否实际加载或执行。本例没有配置 `report-uri` 或 `report-to`，也就是没有配置外部报告收集地址，不能把页面上的 meta 当成一套已经完成的报告后台。

当前策略的每条指令如下。它们是本项目开发示例的实际值，不是可直接套用到所有站点的生产模板。

| 指令 | 在本例中的含义 |
| --- | --- |
| `default-src 'self'` | 未单独指定的资源类型默认只允许同源，即与当前页面协议、主机和端口相同的来源 |
| `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:` | 允许同源脚本、内联脚本、eval 类执行方式和 Blob URL 脚本；这些宽松项不应未经审查进入生产 |
| `style-src 'self' 'unsafe-inline'` | 允许同源与内联样式，本例注入的 `<style>` 也依赖内联样式许可 |
| `img-src 'self' data: blob:` | 允许同源、Data URL 和 Blob URL 图片 |
| `connect-src 'self' ws: wss:` | 允许同源连接以及 WebSocket 连接，覆盖开发服务器的热模块替换（HMR，即更新模块时尽量保留页面状态）等通信需求 |
| `font-src 'self' data:` | 允许同源字体与 Data URL 字体 |
| `worker-src 'self' blob:` | 允许同源与 Blob URL Worker |
| `object-src 'none'` | 禁止 `<object>`、`<embed>` 等插件对象内容 |
| `base-uri 'self'` | 把 `<base>` 可使用的地址限制为同源 |

### 为什么开发环境 CSP 不能照搬生产

Vite 开发链路可能使用内联脚本或样式、eval 形式的开发辅助代码、Blob Worker，以及用于 HMR 的 `ws:`/`wss:` 连接。本例因此保留了 `'unsafe-inline'`、`'unsafe-eval'`、`blob:` 和较宽的连接来源。

这套值解决的是“开发页面能够运行并观察策略”，不是“生产页面已经获得最小权限保护”。生产环境应按真实资源清单收紧来源，移除不再需要的 `'unsafe-eval'` 和宽泛连接源，并处理内联脚本、样式的授权方式。**只把 `Report-Only` 改成 enforcing 名称就直接上线，既可能破坏功能，也不能替代安全审查。**

### 为什么使用精确字符串替换，它的边界在哪里

```ts
html.replace(
  '<div id="app"></div>',
  `<div id="app">${skeletonMarkup}</div>`,
)
```

这里的替换范围故意很小：不使用宽泛正则解析 HTML，也不尝试匹配任意 `<div>`，从而避免误改其他节点或脚本字符串。

但它不是通用 HTML 解析器，必须清楚以下边界：

- 字符串形式的 `replace` 只替换第一个完全匹配的 `<div id="app"></div>`。
- 属性顺序、已有属性或空白一旦变成其他形式，就可能不再匹配；未匹配时 `html` 保持原样，但 `tags` 仍会返回。
- 本例没有按入口或环境增加额外过滤条件。Vite 交给该插件处理的每段 HTML 都会经过这套逻辑，而不是只在某个前端路由访问时执行。
- 若未来需要多入口差异化骨架或策略，应增加明确的入口判断，而不是把正则写得更宽泛。

## 配置接入与源码对应关系

`plugins/html/index.ts` 已把本例放进 HTML 注入插件数组：

```ts
export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts(), injectHeadAssets(), mpaEntry(), preconnect()]
}
```

数组顺序也是这些插件 `transformIndexHtml` 钩子的默认执行顺序。前一个插件返回的 `html` 会交给后一个插件继续处理，各插件声明的 `tags` 则由 Vite 汇总并注入最终页面。

根 `vite.config.ts` 已在 `plugins` 数组中展开 `...htmlInjectionPlugins()`，所以本例不需要再添加一份独立配置。页面侧的连接也已经完成：

```ts
// src/plugin-lab/routes/html-injection.ts
{
  path: '/plugins/html-injection',
  name: 'plugin-lab-html-injection',
  component: () => import('@/views/plugins/categories/HtmlInjectionDemos.vue'),
}
```

对应关系可以概括为：插件负责改写 HTML，`src/main.ts` 负责挂载根组件，路由负责加载演示组件，演示组件负责把最终 DOM 与计算样式展示出来。四者缺一不可。

## 验证步骤与可观察预期

下面分别验证开发响应、构建产物和运行时结果。命令是供实际验证时执行的步骤，并不表示本文已经执行过它们。

### 1. 检查 dev 转换后的 HTML

启动开发服务器，并在另一个终端请求首页：

```bash
pnpm exec vite --port 5214
curl http://localhost:5214/
```

检查返回的 HTML，而不是只看磁盘上的源文件。预期结果：

1. `<head>` 中存在 `meta[http-equiv="Content-Security-Policy-Report-Only"][data-html-injection="csp"]`，其 `content` 包含前文九条指令，并以 `; ` 连接。
2. `<head>` 中存在 `style[data-html-injection="theme"]`，包含 `#6d28d9`、`#f5f3ff` 和骨架样式。
3. `<div id="app">` 内存在 `#plugin-lab-skeleton`，并带有 `data-html-injection="skeleton"`、`role="status"` 和 `aria-label="页面加载中"`。
4. 根目录 `index.html` 仍保留原来的空 `<div id="app"></div>`，没有被插件回写。

### 2. 检查 build 产物

需要验证生产转换时执行：

```bash
pnpm build
```

随后检查 `dist/index.html`。预期同样存在 Report-Only meta、主题 style 和 `#app` 内骨架；最终 HTML 的空白、资源 URL 或其他插件标签可以与开发响应不同，不应要求两者逐字符一致。构建产物存在骨架也不能单独证明运行时没有残留，还需要下一步检查。

### 3. 检查运行时页面与骨架消失

开发服务器运行时访问：

```text
http://localhost:5214/plugins/html-injection#head-assets
```

在“CSP、主题与首屏骨架”面板中，预期看到：

- “Report-Only CSP”区域展示当前 meta 的实际 `content`，指令与插件源码一致。
- “主题计算样式”区域显示变量 `#6d28d9`；计算背景色是 `#f5f3ff` 对应的浏览器序列化值，通常显示为 `rgb(245, 243, 255)`。
- “挂载后的骨架状态”显示“骨架已被 Vue mount 替换”。在 Elements 中应找不到 `#plugin-lab-skeleton`，对应状态元素的 `data-remaining` 为 `"false"`。
- 页面应能正常使用。若控制台出现 `[Report Only]` 信息，应把它与实际阻断区分开，不能只看是否出现 CSP 字样。

要观察挂载前的骨架，可在 DevTools 的 Network 中启用 **Disable cache**，选择 **Slow 3G** 等节流配置，再刷新并查看 Performance 录屏或挂载前的 DOM 快照。可观察预期是：应用挂载前可以捕获到 `#plugin-lab-skeleton`，挂载后它消失；它不是稳定停留的页面内容，也不要求所有设备都能肉眼捕捉。

也可以临时停用 JavaScript，再请求页面。此时 Vue 不会挂载，静态骨架应继续存在；这个方向验证的是“转换后的 HTML 自带骨架”，不是“Vue 会替换骨架”。验证后记得恢复网络与 JavaScript 设置。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 生产 CSP：enforcing、HTTP Header、nonce/hash 与报告收集

- Report-Only 适合上线前观察和灰度，不是强制防线。正式保护还需要经过验证的 `Content-Security-Policy` enforcing 策略，并持续检查违规与资源兼容性。
- 生产环境优先通过 **HTTP 响应头**下发 CSP。响应头由服务器随 HTML 返回，适用范围和指令支持比 meta 更完整。
- **nonce** 是每次响应生成、只授权指定脚本或样式的一次性随机数；**hash** 是按内联内容计算的摘要。两者可以替代部分 `'unsafe-inline'` 需求，但必须正确生成、注入和轮换，不能固定复用一个全站 nonce。
- 报告收集还需要端点、去重、告警和隐私控制。本例没有这些设施，也没有外部报告地址。
- `frame-ancestors` 用于限制页面能被哪些页面嵌入，**不能通过 meta 生效，必须使用 HTTP 响应头**。
- 第三方 SDK、字体、图片、接口和 WebSocket 更新后都要重新核对资源清单；不能一边保留无限宽松的来源，一边把策略视为安全收益。

:::

::: details 主题、FOUC 与 SSR

- 提前注入主题变量有助于首屏样式尽快确定，但不能单独保证消除 **无样式内容闪烁（Flash of Unstyled Content，FOUC）**。完整方案还需考虑样式加载顺序、关键 CSS 和页面布局。
- 主题变量在真实项目中应纳入设计 token 体系，并明确暗色模式、租户覆盖和优先级规则。本例只提供两个变量，没有实现这些主题系统。
- 骨架不等于服务端渲染（SSR），它没有输出真实业务内容，也不能替代 SEO 或可访问的服务端页面。
- 若引入 SSR，需要让服务端 HTML、骨架和客户端水合（客户端接管服务端 DOM）保持一致，避免重复骨架或水合不匹配。本例只演示客户端挂载替换。

:::

::: details 骨架的可访问性、失败状态与减少动态效果

- 当前骨架带有 `role="status"` 和 `aria-label="页面加载中"`，用于表达加载状态；一个空标题元素和两个空占位条元素只负责视觉结构。
- 源码已通过 `@media (prefers-reduced-motion: reduce)` 将骨架动画设为 `none`。这里的“减少动态效果”指尊重操作系统或浏览器中希望减少动画的偏好，不是简单隐藏骨架。
- 真实页面还应让骨架尺寸接近最终布局，减少布局跳动，并确保加载状态、错误状态和真实内容对辅助技术都可理解。
- 如果模块下载或 Vue 启动失败，骨架可能一直停留。本例没有实现超时、重试或错误提示；生产页面需要为这些失败路径提供可理解的出口。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；另一种 head 标签描述方式可对照 [脚本注入示例](./01-inject-scripts.md)。
