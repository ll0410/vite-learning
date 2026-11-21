# 10. 注入 CDN、监控脚本与统计代码

应用有时需要在业务入口前加载来自内容分发网络（CDN）的软件开发工具包（SDK）、错误监控脚本或访问统计脚本。如果每个 HTML 入口都手写一遍，脚本地址、属性和顺序很容易逐渐不一致。Vite 插件可以从同一份配置生成这些标签。

本例故意不连接真实第三方服务，而是注入三个**本地教学替身（stub）**。它们只记录自己的执行顺序和加载标记：浏览器会从当前 Vite 服务请求三个 JavaScript 文件，但这些文件不会请求外部 CDN、监控或统计服务。

整条链路可以概括为：

```text
脚本配置数组：cdn → monitor → analytics
  → 映射为 HtmlTagDescriptor[]
  → Vite 将描述符序列化为 head 中的 script 标签
  → 浏览器按文档顺序执行 public/plugin-lab/ 中的本地 stub
  → stub 写入 window.__pluginLabHtml
  → 演示组件读取执行顺序、加载标记和实际 script 标签
```

下面先跟着 `cdn → monitor → analytics` 走完这条链路，再回头解释它为什么成立。

## 核心示例：从三项配置到页面上的“已加载”

### 1. 输入：脚本配置数组

默认清单位于 `plugins/html/inject-scripts.ts`。`ScriptStub` 描述一个教学脚本，`InjectScriptsOptions` 允许调用方替换整份清单（以下省略类型导入与注释）：

```ts
export interface ScriptStub {
  purpose: 'cdn' | 'monitor' | 'analytics'
  src: string
}

export interface InjectScriptsOptions {
  scripts?: ScriptStub[]
}

const localScripts: ScriptStub[] = [
  { purpose: 'cdn', src: '/plugin-lab/cdn-stub.js' },
  { purpose: 'monitor', src: '/plugin-lab/monitor-stub.js' },
  { purpose: 'analytics', src: '/plugin-lab/analytics-stub.js' },
]
```

数组顺序就是本例的注入顺序：`cdn`、`monitor`、`analytics`。三个 `src` 都指向 `public/plugin-lab/` 中的真实文件：开发时，Vite 把 `public/` 中的文件提供在站点根路径下；构建时，再把它们复制到产物根目录。

`purpose` 有两个彼此独立的对应物，不要把它们误认为自动传参：

- 插件把配置中的 `purpose` 写成标签的 `data-html-injection` 属性。
- 每个 stub 在执行时写入一个与 `purpose` 相同的字符串。

也就是说，当前名称一致是源码有意保持的约定，并不是插件把 `purpose` 传进了浏览器脚本。

### 2. 转换：一项配置变成一个标签描述符

`HtmlTagDescriptor` 可以理解为“HTML 标签说明书”：用对象写明标签名、属性和注入位置，再由 Vite 生成真正的标签。`injectScripts` 使用 `transformIndexHtml` 钩子返回这些说明书（以下省略注释）：

```ts
export function injectScripts(options: InjectScriptsOptions = {}): Plugin {
  const scripts = options.scripts ?? localScripts

  return {
    name: 'plugin-lab:inject-scripts',
    transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
      return {
        html,
        tags: scripts.map((script) => ({
          tag: 'script',
          attrs: {
            src: script.src,
            'data-html-injection': script.purpose,
          },
          injectTo: 'head',
        })),
      }
    },
  }
}
```

这里保留传入的 `html`，只通过 `tags` 添加内容。把默认清单上的 `scripts.map(...)` 展开，得到的描述符等价于：

```ts
const tags: HtmlTagDescriptor[] = [
  {
    tag: 'script',
    attrs: {
      src: '/plugin-lab/cdn-stub.js',
      'data-html-injection': 'cdn',
    },
    injectTo: 'head',
  },
  {
    tag: 'script',
    attrs: {
      src: '/plugin-lab/monitor-stub.js',
      'data-html-injection': 'monitor',
    },
    injectTo: 'head',
  },
  {
    tag: 'script',
    attrs: {
      src: '/plugin-lab/analytics-stub.js',
      'data-html-injection': 'analytics',
    },
    injectTo: 'head',
  },
]
```

这一步仍然只是 JavaScript 对象，没有请求任何 `src`，也没有在 Node.js 中执行这些脚本。

### 3. 输出：描述符成为 head 中的真实标签

Vite 将三个描述符序列化，并放到 `head` 的结束标签之前。开发 HTML 中与本例相关的部分如下，原有内容和其他插件生成的标签均已省略：

```html
<head>
  <!-- 省略原有 head 内容与其他插件生成的标签 -->
  <script src="/plugin-lab/cdn-stub.js" data-html-injection="cdn"></script>
  <script src="/plugin-lab/monitor-stub.js" data-html-injection="monitor"></script>
  <script src="/plugin-lab/analytics-stub.js" data-html-injection="analytics"></script>
</head>
```

至此，插件的任务已经完成。接下来的加载标记不是插件写入的，而是浏览器执行标签所指向的文件后产生的。

### 4. 执行：三个本地 stub 留下证据

`public/plugin-lab/cdn-stub.js` 的完整内容是：

```js
window.__pluginLabHtml = window.__pluginLabHtml || { order: [], loaded: {} }
window.__pluginLabHtml.order.push('cdn')
window.__pluginLabHtml.loaded.cdn = true
```

`public/plugin-lab/monitor-stub.js` 的完整内容是：

```js
window.__pluginLabHtml = window.__pluginLabHtml || { order: [], loaded: {} }
window.__pluginLabHtml.order.push('monitor')
window.__pluginLabHtml.loaded.monitor = true
```

`public/plugin-lab/analytics-stub.js` 的完整内容是：

```js
window.__pluginLabHtml = window.__pluginLabHtml || { order: [], loaded: {} }
window.__pluginLabHtml.order.push('analytics')
window.__pluginLabHtml.loaded.analytics = true
```

第一行在浏览器全局对象 `window` 上创建或复用状态对象；第二行把当前脚本名称追加到 `order` 数组；第三行把对应的 `loaded` 标记设为 `true`。复用已有对象可以避免后执行的脚本清空前一个脚本的记录。

三个脚本都执行后，状态应为：

```js
{
  order: ['cdn', 'monitor', 'analytics'],
  loaded: { cdn: true, monitor: true, analytics: true },
}
```

这些布尔值只表示相应 stub 执行到了赋值语句，不代表真实 CDN SDK、Sentry 或统计 SDK 已完成初始化。

### 5. 消费：页面读取状态，而不是让插件伪造结果

路由 `src/plugin-lab/routes/html-injection.ts` 将 `/plugins/html-injection` 指向 `HtmlInjectionDemos.vue`。组件在 `<script setup>` 中读取全局状态（以下省略 `HtmlScriptState` 接口）：

```ts
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
```

组件还直接查询当前文档中的实际标签：

```ts
const scriptTags = Array.from(
  document.querySelectorAll<HTMLScriptElement>('script[data-html-injection]'),
).map((script) => ({
  purpose: script.dataset.htmlInjection ?? '',
  src: script.getAttribute('src') ?? '',
  markup: `<script src="${script.getAttribute('src')}" data-html-injection="${script.dataset.htmlInjection}"><\/script>`,
}))
```

因此，“本地 CDN、监控与统计脚本”面板展示的是三组不同证据：

| 页面内容 | 数据来源 | 能说明什么 |
| --- | --- | --- |
| “执行顺序”中的 `cdn → monitor → analytics` | stub 追加的 `order` | 三段记录实际发生的先后顺序 |
| CDN、监控、统计均为“已加载” | stub 设置的 `loaded` | 三个 stub 都执行到了赋值语句 |
| “实际 script 标签” | `document.querySelectorAll` | 当前 DOM 中确实存在对应标签及其属性 |

这样，配置、最终 HTML、浏览器执行和页面结果就闭合成了同一条可检查的链路。

## 实现原理：顺序与时机为什么成立

### `transformIndexHtml` 只负责转换 HTML

`transformIndexHtml` 是 Vite 提供的 HTML 转换钩子，也就是插件在 HTML 输出前参与处理的函数。开发服务器返回 HTML 和生产构建生成 HTML 时都会执行它；每个 HTML 入口都会分别经过转换。

本例的钩子在 Node.js 侧完成两件事：

1. 原样返回收到的 `html`，不修改项目里的 `index.html` 源文件。
2. 返回 `HtmlTagDescriptor[]`，让 Vite 统一生成并插入标签。

它不会下载 `src`，也不会执行 stub。只有浏览器解析最终 HTML 时，脚本加载和执行才开始。

### `injectTo: 'head'` 指定插入点，数组保留相对顺序

`injectTo: 'head'` 表示把标签插到 `</head>` 之前，而不是插到 `body`，也不是在 Vue 挂载后动态创建标签。三个描述符来自同一次有序 `map`，所以它们在最终文档中保持 `cdn → monitor → analytics` 的相对顺序。

其他插件也可以向 `head` 添加内容，或使用其他注入点。因此，阅读完整 HTML 时应关注这三个脚本的相对顺序，而不是假设整个 `head` 只有它们。

### 传统同步脚本按文档顺序执行，并先于模块入口

这里的标签没有 `async`、`defer`，也没有 `type="module"`，属于**传统同步脚本**：HTML 解析器遇到外部脚本时，会等待脚本下载并执行，再继续解析后面的文档。浏览器可以预先下载资源，但不会因此打乱这类脚本的文档执行顺序。

根 `index.html` 中的应用入口则是：

```html
<script type="module" src="/src/main.ts"></script>
```

模块脚本默认延迟到文档解析完成后执行。因此，在当前结构中，时序是：

```text
解析 head
  → 依次执行 cdn、monitor、analytics 传统同步脚本
  → 继续完成文档解析
  → 执行模块入口及后续路由组件
  → HtmlInjectionDemos.vue 读取已经写好的状态
```

顺序保证来自脚本类型和文档顺序，**不是因为文件很小，也不是因为文件放在本地**。如果加上 `async`，这项保证就会改变，详见文末边界说明。

### 返回 `tags` 优于手写 `</head>` 拼接

直接查找 `</head>` 并拼接字符串在当前固定模板上看似简单，但声明式描述符更适合插件协作：

- `tag`、`attrs` 和 `injectTo` 分别表达结构，不必由每个插件自行序列化属性和处理转义。
- Vite 统一负责序列化与插入位置，避免多个插件反复查找、替换同一个结束标签。
- 原 HTML 可以继续作为字符串在钩子链中传递，新增标签则由 Vite 汇总，职责更清楚。
- 返回类型会检查描述符结构，减少漏写闭合标签或属性拼接错误。

这不等于 Vite 会自动去重。同一插件注册多次，或源码标签与注入标签重复，仍可能生成重复脚本。

## 配置接入：默认清单从哪一层生效

`plugins/html/index.ts` 汇总本分类的四个插件（以下省略注释）：

```ts
import type { Plugin } from 'vite'
import { injectScripts } from './inject-scripts.ts'
import { injectHeadAssets } from './inject-head-assets.ts'
import { mpaEntry } from './mpa-entry.ts'
import { preconnect } from './preconnect.ts'

export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts(), injectHeadAssets(), mpaEntry(), preconnect()]
}
```

根 `vite.config.ts` 已导入 `htmlInjectionPlugins`，并在 `plugins` 数组中展开。相关配置节选如下，前后其他插件省略：

```ts
plugins: [
  // 其他插件省略
  ...htmlInjectionPlugins(),
  // 其他插件省略
],
```

当前调用是 `injectScripts()`，所以 `options.scripts ?? localScripts` 选择默认清单。若传入 `scripts`，它会**替换**而不是合并默认数组；传入空数组则不会注入这组脚本。没有额外传入 `async` 或 `defer` 时，调整配置数组会同时调整标签顺序和传统同步脚本的执行顺序。

## dev 与 build 验证

下面给出可复现的操作和可观察的预期结果，需要在自己的环境中执行。

### 开发环境：同时检查 HTML 与运行时状态

1. 启动开发服务：

   ```bash
   pnpm exec vite --port 5214
   ```

2. 打开 `http://localhost:5214/plugins/html-injection#inject-scripts`。

   预期结果：“本地 CDN、监控与统计脚本”面板中，“执行顺序”为 `cdn → monitor → analytics`；CDN、监控、统计三项加载标记均为“已加载”；“实际 script 标签”依次列出三个 `/plugin-lab/*-stub.js` 地址，且 `data-html-injection` 分别为 `cdn`、`monitor`、`analytics`。

3. 在浏览器控制台读取：

   ```js
   window.__pluginLabHtml
   ```

   预期结果：`order` 为 `['cdn', 'monitor', 'analytics']`，`loaded.cdn`、`loaded.monitor`、`loaded.analytics` 均为 `true`。

4. 请求开发 HTML：

   ```bash
   curl http://localhost:5214/
   ```

   预期结果：`head` 中三个 `script[data-html-injection]` 各出现一次，相对顺序为 `cdn → monitor → analytics`，并位于 `</head>` 之前。项目中的 `index.html` 源文件不会被这次转换改写。

5. 在浏览器 Network 面板筛选 `plugin-lab`。

   预期结果：三个 stub 都由当前开发服务提供并成功加载；stub 自身不会发出指向外部监控或统计服务的请求。

### 生产构建：检查产物，再用浏览器复核

1. 执行构建：

   ```bash
   pnpm build
   ```

   预期结果：`dist/index.html` 仍包含同一组三个标签，每个各一次且相对顺序不变；`dist/plugin-lab/` 下存在 `cdn-stub.js`、`monitor-stub.js`、`analytics-stub.js`。当前钩子没有按入口过滤，因此同时检查 `dist/admin.html` 时也会看到这组标签。

2. 启动产物预览：

   ```bash
   pnpm exec vite preview --port 5314
   ```

3. 打开 `http://localhost:5314/plugins/html-injection#inject-scripts`，重复开发环境中的页面与控制台检查。

   预期结果：页面仍显示相同执行顺序和三个“已加载”标记，说明构建 HTML 中的标签确实加载并执行了复制到 `dist/plugin-lab/` 的文件，而不只是字符串看起来正确。

## 进阶边界

::: details 接入真实 CDN、Sentry 与统计服务时还要处理什么

- **`async` 会切断配置顺序与执行顺序之间的等价关系**：异步脚本下载完成后即可执行，网络快慢可能让 `analytics` 先于 `cdn`。有依赖关系时，应保留可保证顺序的加载方式，或用明确的 Promise、回调和初始化流程协调依赖，不能只看标签顺序。
- **加载成功不等于初始化完成**：真实 Sentry SDK 通常还要配置数据源名称（DSN）、release、environment 和采样率，并处理加载失败、source map（压缩代码到源码的映射）上传及敏感数据过滤。统计 SDK 也有自己的初始化与队列语义，不能把本例的 `loaded = true` 当作“监控已可用”或“统计已开始”。
- **重复标签和重复初始化要分别防范**：多个插件、多个插件实例或 HTML 中的手写标签都可能重复注入同一 SDK；Vite 不会根据 `src` 自动去重。即使复用了全局对象，重复执行仍可能重复追加 `order`、注册监听器或上报统计，因此需要同时保证标签唯一和初始化只执行一次。
- **统计脚本还有产品与合规条件**：处理用户同意管理、单页应用（SPA）路由切换埋点、广告拦截、超时与失败降级，避免开发流量写入正式统计。可以依据解析后的 mode 或公开环境配置决定是否启用。
- **真实 CDN 需要完整性、版本与回退策略**：子资源完整性（SRI）通过 `integrity` 中的摘要让浏览器校验脚本内容，跨域场景还要正确配置 `crossorigin`。同时锁定版本，设计超时、本地回退和 CSP 白名单；脚本升级时必须同步更新完整性摘要。
- **`public/` 文件没有打包内容 hash**：这些文件按原路径提供并复制，不进入模块依赖图，也不会像构建资产那样自动获得内容哈希。生产使用时要自行设计版本化文件名、缓存更新与回滚策略，部署在非根路径时还要核对最终脚本 URL。
- **公开脚本中不能放秘密**：插件配置、HTML 属性和浏览器 JavaScript 都可被用户查看。Sentry DSN、统计公开写 key 等应按公开标识对待并限制权限，不能把私有密钥放进去；错误和统计数据还要最小化采集个人信息，配置脱敏、采样、同意管理与数据保留策略。

:::

插件钩子的基础用法可继续回顾 [ch10 插件机制](../../guide/ch10-plugins.md)。
