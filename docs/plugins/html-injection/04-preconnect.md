# 13. 注入 preconnect 做性能优化

页面从另一个 **origin（来源，即协议、主机名和端口的组合）** 加载关键字体、API 或静态资源时，浏览器通常要先完成域名系统（DNS）解析和 TCP 连接，HTTPS 还涉及 TLS 加密握手。**preconnect（预连接）** 是一种“资源提示”：把目标 origin 提前告诉浏览器，让它有机会在真正请求资源前完成这些连接准备。

本例用 Vite 插件自动生成 preconnect，同时生成只做主机名解析的 **dns-prefetch（DNS 预取）**。重点不是“注入得越多越好”，而是看懂四个本地配置字符串怎样经过两轮去重，变成两个 preconnect 和两个 dns-prefetch。

默认配置只包含 `localhost` 和 `127.0.0.1`，不配置或请求任何外网服务。这个实验验证的是 HTML 生成与注入结果，不是真实跨域业务的性能对照实验；标签存在既不代表浏览器已经建立连接，也不能单独证明性能有所提升。

## 先看懂：四条输入为什么变成 2+2 个标签

一句话概括：**先按完整 origin 为 preconnect 去重，再按不含端口的 hostname 为 dns-prefetch 去重，最后把标签交给 Vite 注入；演示页读取的是注入后的真实 `<link>`。**

这里的 **hostname（主机名）** 只是 origin 中的一部分，不含协议和端口。例如：

| 值 | 内容 |
| --- | --- |
| `http://localhost:5173` | 完整 origin：HTTP 协议、`localhost` 主机名、`5173` 端口 |
| `localhost` | hostname：只有主机名 |

完整数据流如下：

```text
四个本地 origin 字符串（含重复值和尾斜杠变体）
  → new URL(origin) 解析，并过滤非 HTTP(S) 地址
  → 用 URL.origin 归一化，Map 按 origin 去重
  → 得到两个唯一 origin
  → 每个 origin 生成一个 preconnect，保留端口
  → 从这两个 origin 取出 URL.hostname，Set 按 hostname 去重
  → 得到两个唯一 hostname
  → 每个 hostname 生成一个 dns-prefetch，使用 //hostname
  → 四个描述符都声明 injectTo: 'head-prepend'（插到 <head> 前部）
  → Vite 在开发（dev）响应和生产构建（build）的每个 HTML 入口中注入真实 link
  → 演示组件枚举这些 link，列出 rel、href 和 crossorigin
```

### 1. 输入：四个字符串，两两等价

`plugins/html/preconnect.ts` 中的默认数组是：

```ts
const localOrigins = [
  'http://localhost:5173/',
  'http://localhost:5173',
  'http://127.0.0.1:5173/',
  'http://127.0.0.1:5173',
]
```

逐条解析后，对应关系是：

| 输入字符串 | `new URL(input).origin` | `hostname` |
| --- | --- | --- |
| `http://localhost:5173/` | `http://localhost:5173` | `localhost` |
| `http://localhost:5173` | `http://localhost:5173` | `localhost` |
| `http://127.0.0.1:5173/` | `http://127.0.0.1:5173` | `127.0.0.1` |
| `http://127.0.0.1:5173` | `http://127.0.0.1:5173` | `127.0.0.1` |

`URL.origin` 会去掉尾斜杠，也会去掉路径、查询参数和哈希，只保留连接目标所需的来源信息。因此前两行是同一个 origin，后两行也是同一个 origin。

### 2. 第一轮去重：两个 origin 对应两个 preconnect

TCP/TLS 连接连接到具体的协议、主机和端口。`http://localhost:5173` 与 `http://localhost:5174` 即使 hostname 相同，也属于不同 origin，不能为了“少一个标签”而丢掉端口。

`URL.origin` 会对地址做标准化：非默认端口（如本例的 `5173`）必须保留；HTTP 的 `80`、HTTPS 的 `443` 等默认端口则可能从序列化结果中省略，但 origin 的有效端口并未改变。

### 3. 第二轮去重：两个 hostname 对应两个 dns-prefetch

DNS 负责把主机名解析为 IP 地址，解析过程不使用端口号；端口是后续建立传输连接时才需要的信息。所以 dns-prefetch 使用 `//localhost` 或 `//127.0.0.1`，而不是 `//localhost:5173`。

这一轮是在已经去重的 origin 上重新收集 hostname，不会反过来缩减 preconnect。例如，同一主机名的 `5173`、`5174` 两个端口应保留两个 preconnect，却只共享一个 dns-prefetch。

本例的两个唯一 origin 恰好也对应两个不同的 hostname：`localhost` 和 `127.0.0.1`。所以最终数量是：

```text
四个输入 → 两组等价 origin（每组只留一个）→ 两个 preconnect
两个唯一 origin → 两个不同 hostname → 两个 dns-prefetch
合计 2 + 2 = 四个标签，而不是四个输入各自生成两个标签所得的八个标签
```

## 对照源码：两轮去重怎样落到标签上

### 1. 归一化并保存唯一 origin

`normalizeOrigins` 的完整核心实现如下。`Map` 的键是标准化后的 `url.origin`，相同键只保留一个 URL 对象：

```ts
function normalizeOrigins(origins: string[]): URL[] {
  const uniqueOrigins = new Map<string, URL>()

  for (const origin of origins) {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    uniqueOrigins.set(url.origin, url)
  }

  return [...uniqueOrigins.values()]
}
```

`preconnect()` 开头再用这两个数组分别保存唯一 origin 和唯一 hostname：

```ts
const origins = normalizeOrigins(options.origins ?? localOrigins)
const hostnames = [...new Set(origins.map((url) => url.hostname))]
```

这里先解析 URL 再检查协议，所以非 HTTP(S) 地址会被过滤；完全无法被 `new URL` 解析的输入则会抛出异常，当前教学实现没有额外捕获。

### 2. 生成两组标签描述符

下面是 `transformIndexHtml` 的核心实现节选，省略了源码注释和外层插件对象。`transformIndexHtml` 是 Vite 转换 HTML 的钩子，开发响应和生产构建都会经过它：

```ts
transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
  const preconnectTags: HtmlTagDescriptor[] = origins.map((url) => ({
    tag: 'link',
    attrs: {
      rel: 'preconnect',
      href: url.origin,
      crossorigin: true,
      'data-html-injection': 'preconnect',
    },
    injectTo: 'head-prepend',
  }))
  const dnsPrefetchTags: HtmlTagDescriptor[] = hostnames.map((hostname) => ({
    tag: 'link',
    attrs: {
      rel: 'dns-prefetch',
      href: `//${hostname}`,
      'data-html-injection': 'dns-prefetch',
    },
    injectTo: 'head-prepend',
  }))

  return { html, tags: [...preconnectTags, ...dnsPrefetchTags] }
}
```

这里每个属性都有明确作用：

- `href: url.origin`：preconnect 指向完整 origin，包含非默认端口，不含尾斜杠或路径。
- `href: \`//${hostname}\``：dns-prefetch 使用协议相对的 `//hostname`，不含端口。
- `crossorigin: true`：只添加到 preconnect，选择匿名凭据模式，下一节单独说明。
- `data-html-injection`：本项目的观察标记，方便演示组件选中插件生成的标签；它不是浏览器识别资源提示所必需的属性。
- `injectTo: 'head-prepend'`：让 Vite 把标签插入 `<head>` 前部，使浏览器尽早发现提示。它表达的是插入位置，不保证浏览器一定执行预连接，也不代表性能必然提升。

最终描述符数组先放两个 preconnect，再放两个 dns-prefetch。插件没有手工拼接整段 HTML，而是把标签描述符交给 Vite 序列化和注入。

### 3. `crossorigin` 控制的是凭据模式

`crossorigin` 容易让人误以为只是“允许跨域”。这里的“凭据”是指请求可能携带的 Cookie、HTTP 认证等身份信息；`crossorigin` 决定预连接使用哪种跨域资源共享（CORS）凭据模式，并影响后续请求能否复用这条连接：

- `crossorigin: true` 会注入无值的 `crossorigin` 属性，等价于 `crossorigin="anonymous"`，即匿名模式。
- 凭据请求通常需要与 `crossorigin="use-credentials"` 的预连接匹配。
- 如果预连接与真实资源请求的凭据模式不一致，浏览器可能无法复用已准备的连接。
- `crossorigin` 不会替目标服务器授予 CORS 权限；真实请求仍需满足服务器的 CORS 响应要求。

当前教学实现固定使用 `crossorigin: true`，并没有提供切换凭据模式的选项。真实项目应根据字体、静态资源或 API 请求的实际模式调整实现，不能把这一个属性机械复制到所有场景。

当 `crossorigin` 以无值形式写入 HTML 时，通过 `getAttribute('crossorigin')` 读到的是空字符串 `''`，不是 `null`。因此演示表格中 preconnect 行的该单元格会显示为空白；dns-prefetch 没有这个属性，读到 `null`，页面才显示 `—`。判断属性是否存在时，应使用 `hasAttribute('crossorigin')`，不要把空白单元格误读为“属性缺失”。

### 4. preconnect、dns-prefetch 和 preload 不是一回事

| 提示 | 操作对象 | 提前做什么 | 是否下载具体资源 |
| --- | --- | --- | --- |
| `preconnect` | 一个 origin | 准备 DNS、TCP，HTTPS 还包括 TLS | 否 |
| `dns-prefetch` | 一个 hostname | 提前进行名称解析，可作为较轻量的回退 | 否 |
| `preload` | 一个具体资源 URL | 按声明的资源类型提前加载资源 | 是 |

**preload（预加载）** 需要指向具体 JS、CSS、字体等资源，并正确声明 `as` 等加载信息；preconnect 只知道要连接哪个 origin，不知道之后要下载哪个文件。需要提前建立连接时不能用 preload 替代，需要提前下载关键资源时也不能只写 preconnect。

本例同时生成 preconnect 和 dns-prefetch，是为了展示两种去重维度及回退写法，不意味着生产页面应该不加选择地为每个源同时注入两者。

## 页面展示的是注入结果，不是另一份硬编码答案

路由 `src/plugin-lab/routes/html-injection.ts` 把 `/plugins/html-injection` 指向 `HtmlInjectionDemos.vue`。其中“本地 preconnect / dns-prefetch”面板写明“重复配置已归一化；下表直接读取当前文档 head 中的 link 元素。”

对应实现确实直接查询带观察标记的真实 `<link>`：

```ts
const resourceHints = Array.from(
  document.querySelectorAll<HTMLLinkElement>(
    'link[data-html-injection="preconnect"], link[data-html-injection="dns-prefetch"]',
  ),
).map((link) => ({
  rel: link.rel,
  href: link.getAttribute('href') ?? '',
  crossorigin: link.getAttribute('crossorigin'),
}))
```

这里使用 `getAttribute('href')`，所以表格保留 HTML 中实际写入的 `//localhost`，而不是读取 `link.href` 属性后得到补全协议的绝对 URL。随后模板遍历 `resourceHints`，列出 `rel`、`href`、`crossorigin` 三列。

这样就把原理和结果接上了：**归一化结果决定描述符，描述符决定 `<head>` 中的标签，演示表格再读取这些标签。** 表格本身没有另外维护四个 href。

## 配置接入：默认端口固定为 5173

`plugins/html/index.ts` 将本插件放在 HTML 注入插件数组末尾，省略 import 后的注册代码是：

```ts
export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts(), injectHeadAssets(), mpaEntry(), preconnect()]
}
```

根 `vite.config.ts` 在 `plugins` 数组中通过 `...htmlInjectionPlugins()` 展开注册，同时声明：

```ts
server: {
  port: 5173,
  strictPort: false,
  open: false,
  // 其他配置省略
},
```

需要特别区分“数值一致”和“运行时读取”：

- 插件的 `localOrigins` 固定写有四条 `:5173` 地址；根配置的 `server.port` 当前也是 `5173`。
- 插件**没有读取** `server.port`，也不会读取命令行端口、worktree 或某次临时验证所用端口。
- 因为 `strictPort: false`，如果 `5173` 被占用，开发服务器可能换用其他端口，但注入的 href 仍是 `:5173`。
- 构建 HTML 时也不存在“跟随当前 dev 端口”的逻辑，产物仍使用默认数组中的 `:5173`。

`preconnect` 支持通过 `preconnect({ origins: [...] })` 显式传入其他绝对 HTTP(S) origin。更换实际端口或部署到真实跨域源时，应在 `plugins/html/index.ts` 的注册处提供对应配置，而不是只改开发服务器端口并期待标签自动变化。

## 验证步骤：分别检查 dev、build 和两个 HTML 入口

下面给出可观察的验证步骤与源码对应的预期，不表示本次文档改写已经执行这些命令。验证目标是归一化、去重和注入，不是用标签数量推断性能收益。

### 1. 开发环境：检查主单页应用（SPA）的真实标签

在 `5173` 可用时运行：

```bash
pnpm exec vite --port 5173 --strictPort
```

这里临时加上 `--strictPort`，是为了让端口被占用时直接报错，避免开发服务器换端口后误读验证结果；它不会修改插件源码或默认 href。

打开 `http://localhost:5173/plugins/html-injection#preconnect`，找到“本地 preconnect / dns-prefetch”面板。预期表格只有四行：

| rel | href | crossorigin 状态 |
| --- | --- | --- |
| `preconnect` | `http://localhost:5173` | 属性存在，表格单元格为空白 |
| `preconnect` | `http://127.0.0.1:5173` | 属性存在，表格单元格为空白 |
| `dns-prefetch` | `//localhost` | 属性不存在，表格显示 `—` |
| `dns-prefetch` | `//127.0.0.1` | 属性不存在，表格显示 `—` |

同时在 Elements 或控制台检查：

- 两个 preconnect 都有 `data-html-injection="preconnect"` 和 `crossorigin`，且没有尾斜杠。
- 两个 dns-prefetch 都有 `data-html-injection="dns-prefetch"`，href 不含端口，也没有 `crossorigin`。
- 每种 `rel + href` 组合只出现一次，四个标签都在 `<head>` 内，而不是由演示组件渲染到面板中。

### 2. 开发环境：检查 Admin 第二个入口

多页应用（MPA）是指项目包含多个独立 HTML 入口。本例除了主 `index.html`，还有 `admin.html`；后者运行自己的 `src/mpa/admin.ts`，不会启动主 SPA 的 Vue Router，因此 Admin 页面不会出现上述演示表格。

可以打开 `http://localhost:5173/admin.html` 后在 Elements 中检查 `<head>`，也可以分别请求两个开发入口的原始 HTML：

```bash
curl http://localhost:5173/
curl http://localhost:5173/admin.html
```

预期两个响应都各有一组相同的 2+2 标签，位于 `<head>` 前部。Admin 没有演示表格并不影响验证，因为标签由 Vite 的 HTML 转换钩子注入，而不是由主 Vue 组件创建。

### 3. 生产构建：检查两个 MPA 产物

运行：

```bash
pnpm build
```

随后分别打开 `dist/index.html` 和 `dist/admin.html`。预期每个文件都包含四个唯一资源提示：

- `http://localhost:5173` 和 `http://127.0.0.1:5173` 两个 preconnect；
- `//localhost` 和 `//127.0.0.1` 两个 dns-prefetch；
- 属性与开发环境一致，没有路径、重复尾斜杠变体或同组重复项；
- 即使构建期间没有启动开发服务器，href 中的端口仍固定为 `5173`。

两个文件都应有标签，是因为 `transformIndexHtml` 会分别处理每个构建 HTML 入口，而不是只对主 SPA 路由生效。

## 进阶边界

::: details 真实跨域项目怎样判断是否有收益

- **先确认值得预连接**：目标应是页面确实会使用、关键且能提前知道的跨域 origin。同源资源通常不需要 preconnect；没有后续请求的第三方 origin 也不应预先连接。
- **做有对照的测量**：在资源、凭据模式、缓存与网络条件可控的情况下，对比有无提示的多次结果。观察真实请求等待中的 DNS、TCP、TLS 时间，以及最大内容绘制（LCP）等业务指标，而不是只检查 `<link>` 是否存在。
- **结合实验室和真实用户数据**：Lighthouse 可帮助分析受控环境，真实用户监测（RUM）用于观察不同网络和设备上的分布；单次本地结果不能代表所有用户。
- **计算连接成本**：预连接本身也消耗 DNS、套接字、TLS、CPU 和内存，空闲连接还可能被浏览器或服务器关闭。注入过多、过早或不再使用的连接，可能挤占更关键的网络工作。
- **区分注入证据与性能证据**：本例的四行表格只能证明去重和注入符合实现，不能证明预连接已发生、连接被复用或 LCP 已改善。

:::

::: details 部署、CORS 与本机示例的限制

- **部署 origin 要显式维护**：真实项目应根据环境生成正确的协议、主机名和端口，并与内容分发网络（CDN）、API 或字体资源的实际请求一致。不要把本例固定的 localhost 数组原样发布，也不要把部署路径当成 origin 的一部分。
- **凭据模式要与真实请求匹配**：匿名请求、携带凭据的请求不能使用同一套想当然的 `crossorigin` 设置；同时还要满足目标服务器的 CORS 规则。当前教学插件固定匿名模式，不是通用配置封装。
- **同源与跨源会随访问地址改变**：通过 `localhost:5173` 打开页面时，同地址的 preconnect 是同源提示，`127.0.0.1:5173` 才是另一个 origin；通过后者访问时则相反。本例没有为它们配置对应的跨域关键资源，因此不构成真实收益实验。
- **本地 dns-prefetch 主要用于观察生成规则**：`127.0.0.1` 是 IP 字面量，不需要域名解析；`localhost` 通常也由本机解析。两个标签展示的是按 hostname 去重的结果，不代表生产网络中都有必要。
- **只配置本地源不等于没有本地网络活动**：示例不会主动连接外网，但浏览器看到资源提示后，仍可能根据策略对本机地址进行解析或预连接；是否以及何时执行由浏览器决定。
- **非根部署也要看真实请求**：`URL.origin` 会主动丢弃路径，这是预连接的语义而非路径拼接功能。base、反向代理和 CDN 路径应通过真实资源 URL 验证，不能期待 preconnect 按路径建连。

:::

::: details 常见坑

- **只按原始字符串去重**：尾斜杠、主机名大小写或默认端口的等价写法可能逃过去重，应先使用 `URL.origin` 标准化。
- **用 hostname 去重 preconnect**：这会误合同一主机的不同端口；反过来给 dns-prefetch 加端口又误解了 DNS 的作用。
- **把资源提示当成强制命令**：浏览器可以结合资源状况和自身策略决定是否采用，`head-prepend` 只负责让提示尽早出现。
- **把 preconnect 当成资源下载**：它不会获取具体 JS、CSS、字体或 API 数据；需要提前获取资源时应评估 preload，并保证后续请求确实复用。
- **看到四个标签就宣布优化成功**：标签数量只能验证实现结果，收益必须通过真实跨域请求和性能数据判断。

:::

HTML 转换钩子的背景见 [ch10 插件机制](../../guide/ch10-plugins.md)；`index.html` 与 `admin.html` 的构建入口注册方式见 [MPA 按入口注入不同标签](./03-mpa-entry.md)。
