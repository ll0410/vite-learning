# 16. 调试接口：查看运行时配置、清缓存

开发服务器里有两类状态平时不容易直接观察：Vite 最终采用了什么配置，以及模块转换结果是否仍在缓存中。本例用 `configureServer` 注册两个本地调试接口：一个按白名单返回运行配置，另一个让模块图失效并通知浏览器整页刷新。

这里的“中间件”可以理解为开发服务器处理 HTTP 请求时经过的一层函数。本例的完整链路是：

```text
页面上的 fetch，或 curl 发起的 HTTP 请求
        ↓
configureServer 注册的 /api/lab/debug 中间件
        ↓
按 URL 与请求方法选择端点
        ├─ GET /config：逐项读取白名单字段 → 返回 JSON → 页面展示，不刷新
        └─ POST /clear-cache：模块图失效 → 返回 JSON → 广播 full-reload
                                      ↓
                         浏览器整页刷新并重新请求模块
                                      ↓
                         Vite 重新转换已失效的模块
```

先用“查看安全运行配置”走完一条请求链路，再解释清缓存为什么不能只调用 `invalidateAll()`。

## 核心示例：点击按钮，查看安全运行配置

### 1. 页面发出普通 GET 请求

演示路由 `/plugins/dev-server/debug-endpoints-demo` 会渲染 `src/views/plugins/dev-server/DevServerDemos.vue`，并传入 `scenario: 'debug-endpoints'`。点击“查看安全运行配置”后，`loadDebugConfig` 的核心逻辑如下（省略错误处理）：

```ts
const response = await fetch('/api/lab/debug/config')
if (!response.ok) throw new Error(`HTTP ${response.status}`)
debugConfig.value = (await response.json()) as DebugConfig
```

页面没有拼接当前端口，也没有读取 `import.meta.env`。它只请求一个同源 URL，响应中包含什么完全由服务端插件决定。

### 2. configureServer 认领对应 URL

`plugins/dev-server/debug-endpoints.ts` 在 `configureServer(server)` 中拿到 `ViteDevServer`，并把处理器挂到 `/api/lab/debug`：

```ts
configureServer(server) {
  server.middlewares.use('/api/lab/debug', (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // ……这里省略 /config 与 /clear-cache 两个分支，下文分别展开。
    next()
  })
},
```

浏览器请求的是 `/api/lab/debug/config`。进入这个挂载点后，Connect 会把挂载前缀从 `req.url` 中去掉，因此分支判断使用 `/config`，而不是再次匹配完整前缀。`new URL(...)` 则把查询字符串与路径分开，分支只比较 `url.pathname`。

### 3. 端点逐项构造白名单响应

`/config` 分支先限制方法，再创建一个新的响应对象：

```ts
if (url.pathname === '/config') {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }

  const address = server.httpServer?.address()
  sendJson(res, 200, {
    mode: server.config.mode,
    pluginNames: server.config.plugins.map((plugin) => plugin.name),
    server: {
      port:
        address && typeof address !== 'string'
          ? address.port
          : server.config.server.port,
      strictPort: server.config.server.strictPort,
    },
  })
  return
}
```

响应只有这些字段：

| 响应字段 | 数据来源 | 页面能据此确认什么 |
| --- | --- | --- |
| `mode` | `server.config.mode` | 本次开发服务器使用的 Vite mode，默认开发启动通常为 `development` |
| `pluginNames` | `server.config.plugins.map(...)` | 已解析插件的名称数组，其中应能看到 `lab:debug-endpoints` |
| `server.port` | 优先取 `server.httpServer?.address()` 中的端口 | 服务器当前实际监听的 TCP 端口 |
| `server.strictPort` | `server.config.server.strictPort` | 指定端口被占用时，是否必须报错而不是尝试其他端口 |

这就是“白名单”：调用方需要哪几项，服务端就显式写哪几项。没有列入的字段不会因为以后配置对象新增属性而自动泄露。

不能直接 `JSON.stringify(server.config)`，也不能把整个 `process.env` 或 `import.meta.env` 返回给页面。完整配置和环境变量可能包含本地路径、鉴权配置、令牌或其他秘密；即使当前看似没有敏感值，整体导出也会让以后新增的字段默认进入响应。本例既不读取这些对象中的秘密，也不返回 Cookie、请求头或环境变量。

### 4. 为什么端口要取 actual port

`actual port` 指操作系统中的 HTTP server 已经绑定、真正接受连接的端口，不等于配置文件里写下的期望值。根 `vite.config.ts` 配置了：

```ts
server: {
  port: 5173,
  strictPort: false,
  open: false,
  // ……其余 server 配置省略。
},
```

`strictPort: false` 时，如果指定端口已被占用，Vite 可以尝试后续端口。命令行传入 `--port 5215` 也只是把期望端口改为 `5215`，并不能保证它一定可用。

因此端点先调用 Node HTTP server 的 `address()`：监听完成后，对象形式的返回值中包含实际 `port`。只有拿不到这种地址时，代码才回退到 `server.config.server.port`。如果硬编码 `5173` 或 `5215`，端口自动切换后，诊断响应就会与真实访问地址不一致。

### 5. 页面展示结果，但不需要刷新

`fetch` 把 JSON 存入 `debugConfig`，模板再将这个 ref 格式化输出：

```vue
<pre v-if="debugConfig" class="result" data-testid="debug-config">{{ JSON.stringify(debugConfig, null, 2) }}</pre>
```

“ref”是 Vue 的响应式状态；给它赋值后，模板会自动更新。所以这条链路的结果是：**服务端读取配置 → 返回安全 JSON → 页面局部展示**。它不改变模块缓存，也不发送浏览器刷新消息。

在默认 mode、实际端口确为 `5215` 时，响应结构如下。`pluginNames` 只展示了数组中与本例相关的一项，其他已解析插件名省略，完整内容和顺序以实际响应为准：

```jsonc
{
  "mode": "development",
  "pluginNames": [
    "lab:debug-endpoints"
    // ……其他插件名省略。
  ],
  "server": {
    "port": 5215,
    "strictPort": false
  }
}
```

## 实现原理：清缓存为什么还要 full-reload

### 1. 模块图缓存与浏览器执行状态是两回事

“模块图”是 Vite 在开发服务器中维护的模块关系及转换状态。模块首次被请求时，Vite 会执行相应转换并保留结果；后续处理可以利用这些状态，避免每次从零开始。

调用 `server.moduleGraph.invalidateAll()` 的作用是让服务端已有模块转换结果失效。**它不会自动撤销浏览器已经下载和执行的 JavaScript，也不会自己发起一次页面刷新。** 如果只失效模块图，而浏览器继续运行旧应用且不再请求模块，就看不到重新转换后的结果。

### 2. POST 端点按固定顺序改变服务端状态

点击“清缓存并刷新”时，页面使用：

```ts
const response = await fetch('/api/lab/debug/clear-cache', { method: 'POST' })
```

对应分支先拒绝非 POST 请求，然后执行下面的核心代码（此处省略方法检查）：

```ts
const invalidatedModules = server.moduleGraph.idToModuleMap.size
server.moduleGraph.invalidateAll()
sendJson(res, 200, { invalidatedModules, fullReload: true })
server.ws.send({ type: 'full-reload', path: '*' })
```

四个动作不能混为一谈：

1. **先统计**：`invalidatedModules` 保存调用前的 `idToModuleMap.size`，表示当时模块图中记录的条目规模。它不是已删除文件数，也不是清理后的剩余数量，更不是固定常数。
2. **再失效**：`invalidateAll()` 让已有模块转换状态失效，而不是删除源文件。
3. **返回诊断结果**：HTTP `200` 的 JSON 包含 `invalidatedModules` 和 `fullReload: true`。后者说明服务器下发了整页刷新指令，不是浏览器已经完成刷新的回执。
4. **最后广播**：`server.ws` 是 Vite 开发服务器与浏览器之间的 WebSocket 通信通道。`{ type: 'full-reload', path: '*' }` 通知连接到该开发服务器的客户端整页刷新，`path: '*'` 表示不限定某一个页面路径。

于是完整因果链是：

```text
模块转换结果失效
  → 浏览器收到 full-reload 并重新加载页面
  → 应用入口和依赖模块重新执行、重新向 Vite 请求
  → Vite 发现模块已失效，重新执行转换
  → 页面使用新的转换结果
```

只有 `invalidateAll()`，缺少浏览器重新请求；只有 `full-reload`，则可能重新请求后仍复用有效的旧转换状态。本例把两步连起来，才构成“清模块缓存并刷新页面”。

### 3. 为什么清缓存按钮旁的文字可能一闪而过

页面收到响应后，会执行：

```ts
const result = (await response.json()) as { invalidatedModules: number; fullReload: boolean }
debugResult.value = `已失效 ${result.invalidatedModules} 个模块，full-reload 已发送。`
```

但服务器随后还会广播 `full-reload`。整页刷新会重新创建 Vue 应用，`debugResult`、`debugConfig` 等内存中的 ref 也会重置。因此这段文字可能在刷新前短暂出现，也可能来不及被清楚观察；需要稳定检查响应字段时，应使用后文的 `curl`，需要检查刷新行为时则观察浏览器页面。

此外，WebSocket 消息发给所有已连接的 HMR 客户端，不只是点击按钮的那个标签页。打开多个页面进行验证时，它们都会被刷新。

### 4. 方法限制、状态码和公共响应头

两个端点采用不同方法，是因为它们对服务器的影响不同：读取配置用 GET；改变模块图状态并触发所有客户端刷新用 POST，避免预取或普通链接访问意外触发清缓存。

| 外部 URL | 允许的方法 | 成功响应 | 使用其他方法时 |
| --- | --- | --- | --- |
| `/api/lab/debug/config` | `GET` | `200`；返回 `mode`、`pluginNames`、`server.port`、`server.strictPort` | `405`；`Allow: GET`；正文为 `{ "error": "method_not_allowed" }` |
| `/api/lab/debug/clear-cache` | `POST` | `200`；返回 `invalidatedModules`、`fullReload` | `405`；`Allow: POST`；正文为 `{ "error": "method_not_allowed" }` |

成功和 `405` 响应都经过 `sendJson`：

```ts
function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}
```

`Content-Type` 告诉 `response.json()` 和浏览器这是 UTF-8 JSON；`Cache-Control: no-store` 避免诊断结果或清缓存结果被缓存。`Allow` 则明确告诉调用方这个端点接受什么方法。已处理的分支在 `res.end()` 后直接 `return`，不再调用 `next()`，避免同一请求被重复响应；不属于 `/config` 或 `/clear-cache` 的子路径才会执行 `next()`，交给后续中间件决定结果。

## 配置与页面接入

端点能工作，需要插件注册和页面路由两条线都接通。

### 1. 把插件加入开发服务器插件组

`debugEndpointsPlugin()` 声明了名称和生效范围：

```ts
name: 'lab:debug-endpoints',
apply: 'serve',
configureServer(server) {
  // ……中间件注册逻辑见前文。
},
```

`plugins/dev-server/index.ts` 再把它放进 `devServerPlugins()`：

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

数组顺序也是这些插件 `configureServer` 钩子的默认执行顺序。未被当前中间件认领的请求应调用 `next()`，让后面的中间件继续处理。

根 `vite.config.ts` 在其他插件之间展开这个数组（省略无关插件）：

```ts
plugins: [
  // ……其他插件。
  ...devServerPlugins(),
  // ……其他插件。
],
```

`apply: 'serve'` 把插件限定在 serve 侧，不参与 `vite build` 的构建管线。本例实现的是开发服务器专用的 `configureServer`，因此构建时不会执行这里的中间件注册，生产构建产物和 `vite preview` 也不会凭这段代码获得两个调试接口。

### 2. 把演示页面挂到 Vue Router

`src/plugin-lab/routes/dev-server.ts` 中的记录是：

```ts
{
  path: '/plugins/dev-server/debug-endpoints-demo',
  name: 'dev-server-debug-endpoints',
  component: () => import('@/views/plugins/dev-server/DevServerDemos.vue'),
  props: { scenario: 'debug-endpoints' },
},
```

这个路径是浏览器里的 Vue 页面路由，不是调试 API。`scenario` 让共用的 `DevServerDemos.vue` 显示调试面板；面板中的按钮再分别请求 `/api/lab/debug/config` 和 `/api/lab/debug/clear-cache`。

## 验证步骤

### 1. 启动开发服务器并确认实际端口

```bash
pnpm exec vite --port 5215
```

预期终端输出本地访问地址。项目当前 `strictPort: false`，若 `5215` 已被占用，实际端口可能变化。以下 URL 以 `5215` 为例；如果终端显示其他端口，页面和 `curl` 中的端口都要替换为实际值。

### 2. 在页面检查白名单配置

打开 <http://localhost:5215/plugins/dev-server/debug-endpoints-demo>，点击“查看安全运行配置”。

预期页面展示格式化 JSON：

- 默认启动时 `mode` 为 `development`。
- `pluginNames` 数组包含 `lab:debug-endpoints`，并包含其他已解析插件名。
- `server.port` 与终端显示的实际端口一致，`server.strictPort` 为 `false`。
- 响应中没有完整 `server.config`、`env`、Cookie、请求头或秘密字段。
- 这一步只更新页面上的结果区域，不触发整页刷新。

也可以直接查看原始 HTTP 响应：

```bash
curl -i http://localhost:5215/api/lab/debug/config
```

预期状态为 `200`，包含 `Content-Type: application/json; charset=utf-8` 和 `Cache-Control: no-store`，正文字段与页面一致。

### 3. 检查模块失效结果与全客户端刷新

先打开一个或多个演示页面，再执行：

```bash
curl -i -X POST http://localhost:5215/api/lab/debug/clear-cache
```

预期状态为 `200`，正文结构为：

```text
{
  "invalidatedModules": <N>,
  "fullReload": true
}
```

其中 `<N>` 是占位说明，不是 JSON 中的固定值：它等于本次调用前的 `server.moduleGraph.idToModuleMap.size`，会随已经加载的页面和模块而变化，不要求为某个固定数量。响应同样包含 JSON Content-Type 和 `Cache-Control: no-store`。

请求后，已连接到该开发服务器的页面预期收到 `full-reload` 并整页刷新；刷新后应用重新执行，失效模块在后续请求中重新转换。如果只执行 `curl` 而没有打开浏览器，则只能观察 JSON 响应，不存在可供观察的客户端刷新。

### 4. 分别验证两个 405 分支

```bash
curl -i -X POST http://localhost:5215/api/lab/debug/config
curl -i http://localhost:5215/api/lab/debug/clear-cache
```

第一条命令故意用 POST 请求配置端点，第二条用 `curl` 默认的 GET 请求清缓存端点。预期结果依次为：

- 第一条：`405`，`Allow: GET`，正文为 `{"error":"method_not_allowed"}`，不返回配置。
- 第二条：`405`，`Allow: POST`，正文同样为 `{"error":"method_not_allowed"}`，不失效模块，也不发送 `full-reload`。

## 进阶边界

::: details 为什么不能把它当成生产诊断接口

- 白名单降低的是秘密泄露风险，不代表响应没有信息价值。mode、插件名称和端口仍会暴露工程结构及运行状态，只应放在受控本地开发环境。
- 清缓存会影响服务端模块状态，`full-reload` 又会刷新所有已连接客户端。未授权调用可能干扰其他开发者，不能把它当作无害的单页面按钮。
- `apply: 'serve'` 只是构建与开发命令的选择条件，不是鉴权机制。如果开发服务器通过 `--host` 等方式暴露到局域网或远程环境，能访问服务器的人仍可能请求这些 URL。
- 生产环境不要注册这组端点。确需远程诊断时，应另行实现身份认证、权限校验、审计、访问范围限制，并重新评估清缓存和全客户端刷新这类破坏性操作，而不是直接开放本例。

:::

::: details 容易混淆的几个结论

- **`invalidatedModules` 不是固定模块数**：它在失效前读取 Map 大小，不能据此推断源文件数量，也不表示 Map 随后被清空。
- **`fullReload: true` 不是客户端回执**：它只是响应中声明刷新动作的字段，不能证明每个客户端都已完成刷新。
- **服务端失效不等于浏览器更新**：必须结合后续请求；本例用 `full-reload` 主动促成整页重新加载。
- **405 不是未知路径响应**：只有路径已匹配但方法不对时才返回本例的 `405`。其他子路径会进入 `next()`，最终状态由后续中间件决定。
- **`no-store` 不是访问控制**：它只约束缓存，不能替代认证和授权。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。另一个读取实际监听端口的例子见 [本地代理特殊逻辑与接口转发兜底](./02-proxy-fallback.md)。
