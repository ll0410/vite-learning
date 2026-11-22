# 15. 本地代理特殊逻辑与接口转发兜底

主接口返回 `503`，或者连接在收到响应前被断开时，页面怎样继续得到一份可渲染的数据，同时又不把兜底数据误认为主接口成功？本例用一个开发服务器中间件（接收并处理请求的函数）演示完整的判断与降级过程。

`plugins/dev-server/proxy-fallback.ts` 同时提供两类本地接口：

- `/api/lab/proxy/primary/*`：模拟主服务，分别返回成功、`503` 或直接断开连接。
- `/api/lab/proxy/resource`：页面对外的统一入口，通过 Node.js `fetch` 请求上面的主接口，再决定返回主接口数据还是本地兜底数据。

这里的“转发”**不是** `server.proxy` 配置，而是中间件在服务端主动发起第二次 HTTP 请求。所有请求都发生在当前 Vite 开发服务器内，不访问外部服务。

::: tip 现成方案速览
- **官方 / 成熟方案**：常规路径匹配、重写和 WebSocket 用官方 `server.proxy`；需要自定义请求处理时用 `configureServer`。主上游失败后自动切换备用上游，没有官方通用配置。
- **覆盖程度**：**部分覆盖**。
- **本例定位**：教学用最小实现，重点是理解 Connect 中间件、Node `fetch` 兜底和错误分类。
- **值得自研的时机**：需要按 5xx 或网络错误自动切换上游并接监控时；更推荐在网关层实现。
:::

## 先看结果：一个页面入口，三种数据来源

页面始终只请求：

```text
GET /api/lab/proxy/resource?mode=<模式>
```

三种合法模式的最终结果如下。表中的“主接口结果”发生在服务端第二次请求中，页面实际收到的是最后一列的 `/resource` 响应。

| `mode` | 主接口结果 | 页面收到的 HTTP 状态 | 页面收到的响应字段 |
| --- | --- | --- | --- |
| `success` | `/primary/success` 返回 `200` | `200` | `source: 'primary'`，`message: '本地主接口成功'`，没有 `reason` |
| `http-error` | `/primary/http-error` 返回 `503` | `200` | `source: 'fallback'`，`reason: 'http-503'`，`message: '主接口返回非 2xx，已使用本地兜底数据'` |
| `network-error` | `/primary/network-error` 直接断开 socket，没有 HTTP 状态码 | `200` | `source: 'fallback'`，`reason: 'network-error'`，`message: '主接口网络错误，已使用本地兜底数据'` |

三种模式的外层响应都是 `200`，但 `source` 明确区分了“主接口数据”和“兜底数据”。下面先完整追踪 `http-error`，看清一个 `503` 为什么会变成页面可渲染的 `200` 响应。

## 核心示例：`http-error` 的完整请求链路

### 1. 请求输入：页面只调用 `/resource`

在演示页点击“模拟主接口失败”，会调用 `requestProxy('http-error')`。`src/views/plugins/dev-server/DevServerDemos.vue` 中发出请求的核心语句如下（这里只摘取 `requestProxy` 中的一行，省略 loading 和错误状态处理）：

```ts
const response = await fetch(`/api/lab/proxy/resource?mode=${mode}`)
```

此时 `mode` 为 `http-error`，所以浏览器实际发起的是：

```text
请求 A：GET /api/lab/proxy/resource?mode=http-error
```

先把它称为**请求 A**。它是浏览器与开发服务器之间的请求，也是页面最终等待的那个请求。

### 2. 中间件分流：`/resource` 再发一次 HTTP 请求

中间件挂载在 `/api/lab/proxy`。Connect 是 Vite 开发服务器使用的中间件队列；按路径挂载后，Connect 会暂时去掉这段挂载前缀。因此，请求 A 进入回调时：

```text
浏览器原始路径：/api/lab/proxy/resource?mode=http-error
回调中的 req.url：/resource?mode=http-error
url.pathname：   /resource
mode：           http-error
```

回调确认路径是 `/resource`、方法是 `GET`，并确认 `mode` 合法后，进入转发逻辑。以下是 `try` 中构造并发送第二次请求的核心代码，前后的参数校验和结果分支在此省略：

```ts
const primaryUrl = new URL(
  `/api/lab/proxy/primary/${primaryTargets[mode]}`,
  getRuntimeOrigin(server),
)
const primaryResponse = await fetch(primaryUrl, {
  headers: { Accept: 'application/json' },
})
```

`primaryTargets['http-error']` 的值是 `http-error`，所以第二次请求的路径是：

```text
请求 B：GET /api/lab/proxy/primary/http-error
请求头：Accept: application/json
```

`getRuntimeOrigin(server)` 提供开发服务器当前实际监听的源（协议、主机名和端口），后文会单独解释。请求 B 是由 Node.js 在服务端发起的**回环请求**，也就是从本机开发服务器请求本机开发服务器；它不是直接调用 `/primary/http-error` 对应的 JavaScript 分支，而是再次经过 HTTP 和中间件队列。

### 3. 主接口分支：请求 B 得到明确的 `503`

请求 B 再次进入同一个中间件，但这次 `url.pathname` 是 `/primary/http-error`，命中下面的源码分支：

```ts
if (url.pathname === '/primary/http-error') {
  sendJson(res, 503, { source: 'primary', message: '模拟主接口失败' })
  return
}
```

`sendJson` 是插件内的响应辅助函数，会设置状态码和 JSON 响应头，再通过 `res.end` 结束当前请求。因此，请求 B 得到的是一次完整的 HTTP 响应：

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

```json
{"source":"primary","message":"模拟主接口失败"}
```

关键点是：**`fetch` 收到 `404`、`503` 等非 2xx 响应时不会自动抛异常。** 请求 B 的 `fetch` 正常完成，`primaryResponse.status` 为 `503`，而 `primaryResponse.ok` 为 `false`。`ok` 只表示状态码是否处于 `200–299` 范围。

### 4. 转发结果：请求 A 不转发 `503`，而是返回兜底 `200`

请求 A 中的代码继续检查 `primaryResponse.ok`：

```ts
if (!primaryResponse.ok) {
  sendJson(res, 200, {
    source: 'fallback',
    reason: `http-${primaryResponse.status}`,
    message: '主接口返回非 2xx，已使用本地兜底数据',
  })
  return
}
```

因为状态是 `503`，`reason` 被拼成 `http-503`。这里调用 `sendJson` 的 `res` 属于**请求 A**，所以页面收到的不是请求 B 的 `503`，而是请求 A 的 `200`：

```json
{
  "source": "fallback",
  "reason": "http-503",
  "message": "主接口返回非 2xx，已使用本地兜底数据"
}
```

请求 B 中 `source: 'primary'`、`message: '模拟主接口失败'` 的响应体没有被透传给页面；非 2xx 分支直接构造了新的兜底响应。

### 5. 页面消费者：`response.ok` 检查通过，渲染带来源的 JSON

请求 B 完成并处理完后，请求 A 才结束。回到 `requestProxy`，紧接着请求语句的是下面两行：

```ts
if (!response.ok) throw new Error(`HTTP ${response.status}`)
proxyResult.value = (await response.json()) as ProxyResult
```

请求 A 的状态是 `200`，所以不会抛出 `HTTP 503`。JSON 被写入页面的响应式状态 `proxyResult`，随后模板原样格式化展示：

```vue
<pre v-if="proxyResult" class="result" data-testid="proxy-result">{{ JSON.stringify(proxyResult, null, 2) }}</pre>
```

页面上因此能看到 `source: "fallback"` 和 `reason: "http-503"`；浏览器里的请求 A 仍显示为 `200`，不会显示为主接口的 `503`。

把整个过程按时间顺序放在一起：

```text
浏览器
  │  A：GET /api/lab/proxy/resource?mode=http-error
  ▼
/resource 中间件
  │  B：Node.js fetch /api/lab/proxy/primary/http-error
  ▼
/primary/http-error 中间件
  │  B：返回 503，primaryResponse.ok === false
  ▼
/resource 中间件生成 fallback
  │  A：返回 200 + source=fallback + reason=http-503
  ▼
页面把 JSON 写入 proxyResult 并渲染
```

浏览器 DevTools 的 Network 面板通常只会直接看到请求 A。请求 B 发生在 Node.js 服务端，不是浏览器另外发出的一次页面请求；需要观察请求 B 时，可以直接请求 `/primary/*`，或在真实项目中增加服务端日志与上游监控。

## 另外两种模式在同一链路中怎样分流

### `success`：主接口成功，透传主接口 JSON

请求 B 访问 `/api/lab/proxy/primary/success`，命中：

```ts
if (url.pathname === '/primary/success') {
  sendJson(res, 200, { source: 'primary', message: '本地主接口成功' })
  return
}
```

这次 `primaryResponse.ok` 为 `true`，跳过 fallback 分支。以下是成功路径中发送请求 A 响应的语句：

```ts
sendJson(res, 200, await primaryResponse.json())
```

因此请求 A 的正文来自请求 B，`source` 仍然是 `primary`：

```json
{
  "source": "primary",
  "message": "本地主接口成功"
}
```

成功响应没有 `reason` 字段。虽然 `/resource` 也明确写出状态 `200`，页面能据此判断主接口来源，依靠的仍然是响应体中的 `source`，而不只是状态码。

### `network-error`：没有 HTTP 响应，`fetch` 进入 `catch`

请求 B 访问 `/api/lab/proxy/primary/network-error`，对应分支不会发送状态码或响应体，而是直接销毁本次连接的 socket：

```ts
if (url.pathname === '/primary/network-error') {
  // 主动断开连接，让 resource 请求中的 fetch 进入网络错误分支。
  req.socket.destroy()
  return
}
```

socket 可以理解为本次 TCP 连接。它在 HTTP 响应建立前被断开，请求 B 的 `fetch` 没有状态码可读，也不会得到一个 `ok: false` 的 `Response`，而是抛出异常。转发代码的 `catch` 分支随后为请求 A 构造响应（`try` 部分见前文）：

```ts
} catch {
  // 连接断开、DNS 失败等网络异常进入此分支，用 200 和 source=fallback 明确表示降级结果。
  sendJson(res, 200, {
    source: 'fallback',
    reason: 'network-error',
    message: '主接口网络错误，已使用本地兜底数据',
  })
}
```

断开的只是服务端请求 B 使用的连接；浏览器请求 A 仍然正常收到 `200` 和兜底 JSON。这就是“主接口网络失败”与“页面请求网络失败”不能混为一谈的原因。

## 看懂结果后，再看插件钩子与运行时机

### `configureServer`：注册一次中间件，按请求执行分支

`configureServer` 是 Vite 在创建开发服务器时提供的钩子，也就是插件接入开发服务器的扩展点。它为每个开发服务器实例执行注册逻辑；注册进去的中间件回调，才会在后续匹配请求到来时执行。

本例的核心挂载结构如下，省略具体主接口分支、参数校验和转发逻辑：

```ts
configureServer(server) {
  server.middlewares.use('/api/lab/proxy', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // ……省略 /primary/* 分支
    if (url.pathname !== '/resource') {
      next()
      return
    }
    // ……省略 method、mode 校验与转发
  })
}
```

这里直接调用 `server.middlewares.use`，所以中间件会注册在 Vite 内部中间件之前。它有几条重要边界：

- 只有挂载路径 `/api/lab/proxy` 下的请求会进入这个回调。
- `/primary/*` 分支处理完会 `return`；`/resource` 的各响应分支也会结束请求。
- 其他未认领路径调用 `next()`，把请求交给后续中间件，而不是由本插件随意返回一个结果。
- `new URL(req.url ?? '/', 'http://localhost')` 中的 `http://localhost` 只是解析相对 URL 所需的基准，不是转发目标。真正的请求 B 目标由 `getRuntimeOrigin(server)` 决定。

`/resource` 还有两层输入约束。省略 `mode` 时默认使用 `success`；不支持的 `mode` 返回 `400`：

```json
{"error":"invalid_mode"}
```

`/resource` 只接受 `GET`。其他方法返回 `405`，设置 `Allow: GET`，响应体为：

```json
{"error":"method_not_allowed"}
```

### `apply: 'serve'`：这是开发期能力，不是构建产物

插件对象包含：

```ts
name: 'lab:proxy-fallback',
apply: 'serve',
```

`apply: 'serve'` 表示这个插件只在开发服务场景应用，不参与生产构建。`configureServer` 注册的是运行时中间件，不会被打包成静态 JSON，也不会因为根配置中列出了插件，就自动获得一个生产环境代理。

因此，本例适合验证开发期转发与降级逻辑；生产环境仍需要真实后端、网关或平台提供对应能力。

### 运行时读取实际监听地址，避免端口写死

根 `vite.config.ts` 默认配置 `server.port: 5173` 和 `strictPort: false`，本文验证命令又会通过 `--port 5215` 覆盖默认端口。如果目标端口已被占用且没有启用严格端口模式，Vite 可以自动尝试后续端口。此时把请求 B 写死为 `5173` 或 `5215`，就可能请求到错误服务。

插件没有保存启动时猜测的端口，而是在处理请求时读取已经监听的地址：

```ts
function getRuntimeOrigin(server: ViteDevServer) {
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('开发服务器尚未监听 TCP 端口')
  }
  const hostname =
    address.address === '0.0.0.0'
      ? '127.0.0.1'
      : address.address === '::'
        ? '[::1]'
        : address.family === 'IPv6'
          ? `[${address.address}]`
          : address.address
  return `http://${hostname}:${address.port}`
}
```

请求到来时服务器已经开始监听，`address.port` 因而是当前实际端口，而不是配置期望值。另外两段处理也很必要：

- `0.0.0.0` 和 `::` 是监听所有网卡的通配地址，回环请求分别改用一个明确的 IPv4 或 IPv6 本机地址。
- IPv6 字面量放进 URL 时必须加 `[]`，例如 `[::1]`，否则无法和端口分隔符正确区分。

### 非 2xx 与 socket 网络错误：失败层级不同，入口也不同

两种失败都发生在请求 B，但 Node.js `fetch` 的表现不同：

| 对比项 | 主接口返回非 2xx | 主接口断开 socket |
| --- | --- | --- |
| 是否收到 HTTP 响应 | 是，例如完整的 `503` 响应 | 否，没有可读取的 HTTP 状态码 |
| `fetch` 的表现 | 正常得到 `Response`，不会仅因 `503` 抛异常 | 抛出异常 |
| 判断位置 | `if (!primaryResponse.ok)` | `catch` |
| 请求 A 的 `reason` | `http-${primaryResponse.status}`，本例为 `http-503` | `network-error` |
| 请求 A 的状态与来源 | `200`、`source: 'fallback'` | `200`、`source: 'fallback'` |

所以，不能只用 `try/catch` 等待所有失败，也不能只用 `response.ok` 判断网络是否连通：前者漏掉非 2xx，后者根本无法在请求 B 没有响应时执行。

还要注意，当前 `try/catch` 的范围不只包含 `fetch`，也包含地址构造和成功响应的 JSON 解析。本例固定响应能准确演示断连场景；真实项目若需要区分连接失败、超时、响应解析失败等原因，应进一步拆分错误分类，不能把所有异常都笼统当成上游网络故障。

### fallback 使用 `200`，不等于主接口成功

这里有两个不同层级的结果：

- **HTTP 状态码**描述请求 A 是否得到了一个正常生成的接口响应。兜底分支成功生成了 JSON，所以本例选择 `200`。
- **`source` 与 `reason`**描述数据来自哪里、为什么降级。`source: 'fallback'` 明确表示主接口没有提供最终数据，`reason` 再区分 `http-503` 和 `network-error`。

页面因此可以凭 `response.ok` 接受并渲染响应，同时必须保留 `source`，不能把 `200` 直接记成“主接口成功”。如果监控系统只统计 `/resource` 的 `200`，三种模式会看起来全部成功，主接口故障就会被兜底掩盖。

本例选择 `200` 是为了让演示调用方直接渲染替代数据，不是通用状态码规范。真实项目也可以按业务约定让兜底响应返回 `502/503`，或者保留其他明确的成功/降级语义；无论采用哪种方案，调用方与监控都应能识别数据来源和上游故障。

此外，本例的 fallback 是现场构造的本地数据，**不是缓存数据**。所有经过 `sendJson` 的 JSON 响应都设置了 `Cache-Control: no-store`，包括主接口成功、主接口 `503`、兜底以及参数错误响应。

## 配置接入：插件、页面路由和组件如何连起来

### 1. 把插件加入开发服务器插件组

`plugins/dev-server/index.ts` 中的 `devServerPlugins()` 汇总本分类插件：

```ts
export function devServerPlugins(): Plugin[] {
  return [
    mockApiPlugin(),
    proxyFallbackPlugin(),
    debugEndpointsPlugin(),
    authUploadPlugin(),
  ]
}
```

数组顺序也是这些插件 `configureServer` 钩子的默认执行顺序。`proxyFallbackPlugin()` 位于 mock API 之后、诊断和鉴权上传插件之前；它们使用不同挂载路径，未认领的请求仍应通过 `next()` 继续传递。

根 `vite.config.ts` 先导入插件组：

```ts
import { devServerPlugins } from './plugins/dev-server/index.ts'
```

再在配置对象的 `plugins` 数组中展开。下面只保留注册位置，数组中的其他插件省略：

```ts
plugins: [
  // ……其他插件省略
  ...devServerPlugins(),
  // ……其他插件省略
],
```

即使插件组在根配置中始终出现，`proxyFallbackPlugin` 自身的 `apply: 'serve'` 仍会限制它的应用场景。

### 2. 把页面路径映射到演示组件

`src/plugin-lab/routes/dev-server.ts` 中的对应路由是：

```ts
{
  path: '/plugins/dev-server/proxy-fallback-demo',
  name: 'dev-server-proxy-fallback',
  component: () => import('@/views/plugins/dev-server/DevServerDemos.vue'),
  props: { scenario: 'proxy-fallback' },
},
```

`devServerRoutes` 会被路由汇总文件展开。访问该路径时，Vue Router 加载 `DevServerDemos.vue`，并传入 `scenario: 'proxy-fallback'`；组件据此显示 Proxy fallback 面板，三个按钮分别传入 `success`、`http-error` 和 `network-error`。

根配置中另有一个名为 `lab:plugin-lab-spa-fallback` 的插件：当路径是 `/plugins` 或 `/plugins/...`、`Accept` 包含 `text/html` 且路径没有扩展名时，它会把请求重写到 `index.html`，用于支持前端路由直接访问或刷新。它与本文的接口数据 fallback 是两件事，也不会把 `/api/lab/proxy/*` 改写成页面。

## 验证步骤

下面是可以自行执行的验证操作与**预期结果**，不表示本文已经实际运行这些命令。命令默认在项目根目录执行。

### 1. 启动开发服务器并检查页面

```bash
pnpm exec vite --port 5215
```

如果 `5215` 可用，打开 <http://localhost:5215/plugins/dev-server/proxy-fallback-demo>。如果终端显示 Vite 改用了其他端口，应使用终端给出的实际地址，并同步替换下面命令中的端口；这正是转发目标不能写死端口的原因。

依次点击三个按钮，预期页面分别显示：

| 按钮 | 请求 A 状态 | `source` | `reason` | `message` |
| --- | --- | --- | --- | --- |
| 主接口成功 | `200` | `primary` | 字段不存在 | `本地主接口成功` |
| 模拟主接口失败 | `200` | `fallback` | `http-503` | `主接口返回非 2xx，已使用本地兜底数据` |
| 模拟网络错误 | `200` | `fallback` | `network-error` | `主接口网络错误，已使用本地兜底数据` |

在浏览器 Network 面板中检查三个 `/resource` 请求，预期都能看到 `200`、`Content-Type: application/json; charset=utf-8` 和 `Cache-Control: no-store`。服务端发出的 `/primary/*` 请求 B 不会作为额外的浏览器请求出现。

### 2. 用 curl 同时检查正文和外层状态码

以下命令把响应正文和请求 A 的状态码一起输出，注释是预期输出：

```bash
curl -sS -w '\nHTTP %{http_code}\n' 'http://localhost:5215/api/lab/proxy/resource?mode=success'
# {"source":"primary","message":"本地主接口成功"}
# HTTP 200

curl -sS -w '\nHTTP %{http_code}\n' 'http://localhost:5215/api/lab/proxy/resource?mode=http-error'
# {"source":"fallback","reason":"http-503","message":"主接口返回非 2xx，已使用本地兜底数据"}
# HTTP 200

curl -sS -w '\nHTTP %{http_code}\n' 'http://localhost:5215/api/lab/proxy/resource?mode=network-error'
# {"source":"fallback","reason":"network-error","message":"主接口网络错误，已使用本地兜底数据"}
# HTTP 200
```

不带 `mode` 请求 `/api/lab/proxy/resource` 时，预期与 `mode=success` 相同。

### 3. 对照直接访问主接口与访问转发入口

直接请求会返回 `503` 的主接口：

```bash
curl -sS -i 'http://localhost:5215/api/lab/proxy/primary/http-error'
```

预期状态是 `503`，正文为 `{"source":"primary","message":"模拟主接口失败"}`。它与上一步 `/resource?mode=http-error` 的 `200` 形成对照：前者观察请求 B 的主接口结果，后者观察请求 A 的降级结果。

也可以直接请求断连分支：

```bash
curl -sS -v 'http://localhost:5215/api/lab/proxy/primary/network-error'
```

预期 curl 报告连接被关闭或重置，且收不到正常 JSON 响应；具体错误文字和退出码可能因 curl 版本与平台而异。随后请求 `/resource?mode=network-error`，仍应得到上一步列出的 `200` 兜底响应。

### 4. 检查方法限制和参数边界

```bash
curl -sS -i -X POST 'http://localhost:5215/api/lab/proxy/resource'
```

预期返回 `405`，包含 `Allow: GET`，正文为：

```json
{"error":"method_not_allowed"}
```

再请求非法模式：

```bash
curl -sS -i 'http://localhost:5215/api/lab/proxy/resource?mode=other'
```

预期返回 `400`，正文为：

```json
{"error":"invalid_mode"}
```

这两类输入错误发生在发起请求 B 之前，因此不会生成 fallback，也不会把客户端错误伪装成主接口故障。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 转发真实远程服务时必须补齐的能力

本例只演示固定本地目标、运行时地址、非 2xx 判断和断连降级，不能直接视为生产代理实现。转发真实服务时至少需要处理：

- **连接与响应超时、取消请求**：分别限制连接、响应头和响应体等待时间；浏览器断开时取消对应上游请求，避免无效请求长期占用连接与内存。
- **Header、Cookie 与鉴权**：按白名单转发必要 Header，处理逐跳 Header、`Host`、来源信息和鉴权信息，不能把任意客户端 Header 原样转发。Cookie 还要检查作用域、安全属性和是否需要改写，不能意外泄漏给其他上游。
- **请求方法、正文与目标范围**：本例请求 B 固定为 `GET`，代码只显式设置 `Accept: application/json`，不会把请求 A 的 Header 或 Cookie 原样复制给请求 B；目标路径由固定 `primaryTargets` 映射选择，不接收任意上游 URL。真实代理若允许方法、正文或动态目标，需要单独做协议、大小和目标校验。
- **重定向、响应大小、协议与证书**：明确重定向策略，限制响应体大小，校验上游协议和证书，而不是为了连通性关闭 TLS 校验。
- **重试与幂等性**：只对确认可重试的操作和错误进行有限重试，并设置退避与总耗时预算。即使是 `GET`，也不能未确认业务语义就假设它绝对没有副作用；非幂等写入通常需要幂等键或去重机制。
- **降级策略**：本例会把所有非 2xx 都转为 fallback。真实业务通常不应把 `400`、`401`、`403` 等客户端或鉴权问题一律伪装成成功兜底，应按状态和业务语义决定是否降级。
- **监控与日志**：分别记录上游状态、网络失败、超时、fallback 比例和 `reason`，不能只看 `/resource` 最终返回的 `200`。对外响应还应避免泄露内部地址、堆栈和敏感上游细节。
- **错误分类与响应解析**：当前示例的宽泛 `catch` 也可能接住地址构造或 JSON 解析异常。生产实现应区分网络错误、超时、解析失败和本地响应写入失败，并考虑主接口返回 `2xx` 但正文不符合约定的情况。

:::

::: details 容易混淆的几个概念

- **`server.proxy` 与本例**：本例没有配置 Vite 的 `server.proxy`，而是自己组合 `configureServer`、Connect 中间件和 Node.js `fetch`。
- **主接口 `503` 与页面 `503`**：`/primary/http-error` 是 `503`，但 `/resource?mode=http-error` 是 `200 fallback`；必须先说明观察的是请求 A 还是请求 B。
- **网络错误与非 2xx**：非 2xx 已经收到 HTTP 响应，socket 断连则没有完整响应；两者进入不同代码分支。
- **fallback 与缓存**：本例没有读取缓存，响应还明确设置了 `no-store`；兜底数据只是本地构造的替代结果。
- **接口 fallback 与 SPA fallback**：前者构造 API 的替代 JSON，后者把页面路由重写到 `index.html`，目的和处理路径都不同。
- **插件已注册与生产可用**：根配置展开 `devServerPlugins()` 只完成接入，`apply: 'serve'` 和 `configureServer` 决定这套接口属于开发服务器，不会自动生成生产能力。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；如果想先回顾更小的开发服务器中间件示例，可阅读 [Mock API](./01-mock-api.md)。
