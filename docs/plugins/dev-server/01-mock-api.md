# 14. Mock API

后端接口尚未就绪时，前端仍然需要一条可以真实请求、真实解析并真实渲染的数据链路。本例让 Vite 开发服务器直接提供 `/api/mock/users`，不需要再启动一个独立的 HTTP 服务。

一句话概括：**浏览器发出普通 `fetch` 请求，开发服务器中的插件返回 JSON，Vue 页面把 JSON 渲染成用户列表。**

::: tip 现成方案速览
- **官方 / 成熟方案**：Vite 中间件式的文件 Mock 用 [`vite-plugin-mock-dev-server`](https://github.com/pengzhanbo/vite-plugin-mock-dev-server)；需要 dev 与单元测试共用同一套 handler 时用 [MSW](https://github.com/mswjs/msw)。
- **覆盖程度**：**成熟社区方案**。
- **本例定位**：教学用最小实现，重点是理解 `configureServer` 和 `apply: 'serve'` 如何把接口挂到开发服务器。
- **值得自研的时机**：只需要固定响应或教学演示时；生产环境不要使用 dev mock。
:::

## 核心示例：点击按钮，看到三个用户

### 1. 先跑通这个页面

在项目根目录启动开发服务器：

```bash
pnpm exec vite --port 5215 --strictPort
```

打开 <http://localhost:5215/plugins/dev-server/mock-api>，点击“加载三个用户”。页面应显示：

```text
Alice · frontend
Bob · backend
Carol · designer
```

`--strictPort` 用于固定示例端口；如果 `5215` 已被占用，命令会直接报错，而不是静默换到另一个端口。

### 2. 页面如何请求并展示数据

示例页面是 `src/views/plugins/dev-server/DevServerDemos.vue`。下面摘录其中的 Mock API 部分，省略 import 和其他三个开发服务器示例：

```ts
interface MockUser {
  id: number
  name: string
  role: string
}

const users = ref<MockUser[]>([])
const mockError = ref('')

async function loadUsers() {
  mockError.value = ''
  try {
    const response = await fetch('/api/mock/users')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as { users: MockUser[] }
    users.value = data.users
  } catch (error) {
    mockError.value = error instanceof Error ? error.message : String(error)
  }
}
```

模板中的对应部分如下，省略外层标题和样式：

```vue
<button type="button" @click="loadUsers">加载三个用户</button>
<p v-if="mockError" class="error" role="alert">{{ mockError }}</p>
<ul v-if="users.length" class="users" data-testid="mock-users">
  <li v-for="user in users" :key="user.id">
    {{ user.name }} · {{ user.role }}
  </li>
</ul>
```

这里没有特殊的 Mock 客户端：`fetch('/api/mock/users')` 默认发起 GET 请求，路径与页面同源，也就是协议、主机和端口都相同，因此开发时不需要额外的跨域配置。拿到响应后，代码检查 HTTP 状态，调用 `response.json()` 解析正文，再把 `data.users` 赋给响应式状态 `users`，最后由 `v-for` 渲染列表。

“中间件”可以先通俗地理解为**接住 HTTP 请求并决定如何响应的函数**。整个过程是：

```text
点击“加载三个用户”
        ↓
浏览器 GET /api/mock/users
        ↓
Vite 开发服务器中的 Mock 中间件
        ↓
HTTP 200 + JSON 响应
        ↓
response.json() → data.users → users.value
        ↓
Vue v-for 渲染三个用户
```

页面已经跑通后，再回头看提供响应的插件，就能知道每一段代码位于链路的哪一端。

## 实现原理：开发服务器怎样返回 JSON

完整实现位于 `plugins/mock-api.ts`。下面省略源文件注释，保留全部可执行代码：

```ts
import type { Plugin } from 'vite'

const users = [
  { id: 1, name: 'Alice', role: 'frontend' },
  { id: 2, name: 'Bob', role: 'backend' },
  { id: 3, name: 'Carol', role: 'designer' },
]

export function mockApiPlugin(): Plugin {
  return {
    name: 'lab:mock-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/api/mock/users', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ total: users.length, users }))
      })
    },
  }
}
```

这段代码可以按“数据、生效阶段、挂载位置、响应”四步理解。

### 1. 数据：模块顶层的固定数组

`users` 保存 Alice、Bob、Carol 三个固定用户。每次请求都通过 `JSON.stringify({ total: users.length, users })` 创建响应正文，所以 `total` 始终与数组长度一致。本例没有数据库，也不会保存任何修改。

### 2. 生效阶段：`apply: 'serve'`

`apply` 用来按 Vite 命令筛选插件，`'serve'` 表示它用于开发服务器。执行 `vite build` 时，这个插件不会进入构建流程，因此也不会执行这里的中间件注册逻辑。

它限制的是**插件在 Node.js 服务端的工作阶段**，不是页面里的 `import.meta.env.DEV` 条件判断，更不会把这段服务端代码打包进浏览器产物。

### 3. 挂载位置：`configureServer` 与 Connect

`configureServer` 是 Vite 创建开发服务器时调用的插件钩子。这里的“钩子”（hook）是指框架在特定阶段主动调用的函数。它拿到 `server` 后，可以访问开发服务器的中间件、模块图、文件监听器等能力。

`server.middlewares` 是 Vite 使用的 **Connect 中间件容器**。Connect 按注册顺序处理请求；某个中间件既可以结束响应，也可以调用 `next()` 把请求交给后续中间件。

下面这行把处理函数挂载到 `/api/mock/users`：

```ts
server.middlewares.use('/api/mock/users', (_req, res) => {
  // 设置响应头并结束响应，同上，省略重复代码
})
```

`configureServer` 中直接调用 `use`，会把自定义中间件注册在 Vite 内部的静态文件处理等中间件之前。因此，这个请求不需要对应磁盘上的真实 `api/mock/users` 文件。

### 4. 响应：声明 JSON，然后结束请求

- `res.setHeader(...)` 设置 `Content-Type: application/json; charset=utf-8`，明确告诉客户端正文是 UTF-8 编码的 JSON。
- `JSON.stringify(...)` 把 JavaScript 对象序列化为 JSON 字符串；只设置响应头并不会自动完成序列化。
- `res.end(...)` 发送正文并结束响应。代码没有显式设置状态码，Node.js 默认返回 `200`。
- 响应结束后不调用 `next()`，请求便不会继续进入后续插件、静态文件处理或 SPA 页面回退逻辑。

`JSON.stringify` 实际生成一行文本。为了便于阅读，把同一响应格式化如下：

```json
{
  "total": 3,
  "users": [
    { "id": 1, "name": "Alice", "role": "frontend" },
    { "id": 2, "name": "Bob", "role": "backend" },
    { "id": 3, "name": "Carol", "role": "designer" }
  ]
}
```

## 配置接入：插件与页面分别注册

API 路径和页面路由是两条不同的接入链：`/api/mock/users` 由 Vite 插件处理，`/plugins/dev-server/mock-api` 由 Vue Router 处理。

### 1. 把 Mock 插件加入 Vite

`plugins/dev-server/index.ts` 统一汇总开发服务器插件。数组顺序也是 `configureServer` 钩子的默认执行顺序：

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

随后，`vite.config.ts` 通过展开语法接入这一组插件。下面只摘录相邻配置，省略其他插件：

```ts
...htmlInjectionPlugins(),
...devServerPlugins(),
...buildOutputPlugins(),
```

因此一次 `/api/mock/users` 请求的实际顺序是：先经过排在前面的实验室 SPA 回退中间件；该中间件只改写 `/plugins` 下的 HTML 页面请求，对这个 API 请求会调用 `next()`；随后 `mockApiPlugin()` 结束响应。同组后面的代理、诊断和上传中间件不会再处理这次请求。

如果以后为同一路径注册多个中间件，就要特别注意顺序：已经调用 `res.end()` 的前置中间件不会把请求让给后面的处理器。

### 2. 把示例页加入 Vue Router

`src/plugin-lab/routes/dev-server.ts` 中的对应记录如下，省略同文件的其他三个页面：

```ts
{
  path: '/plugins/dev-server/mock-api',
  name: 'dev-server-mock-api',
  component: () => import('@/views/plugins/dev-server/DevServerDemos.vue'),
  props: { scenario: 'mock-api' },
},
```

`props` 让共用的 `DevServerDemos.vue` 显示 Mock API 场景。该记录经 `src/plugin-lab/routes/index.ts` 汇总，再由 `src/router/index.ts` 展开到 `pluginLabRoutes` 中，位于通配 404 路由之前。

此外，`src/views/Home.vue` 的“请求 mock 接口”按钮直接复用同一地址；`src/views/plugins/categories/CodeGenerationDemos.vue` 则通过 `virtual:generated-api` 中生成的 `getUsers()` 间接请求它。三个页面消费的是同一份开发期数据，不是三份各自的 Mock。

## 验证步骤

### 1. 检查原始 HTTP 响应

保持开发服务器运行，执行：

```bash
curl -i http://localhost:5215/api/mock/users
```

预期状态为 `200`，响应头包含：

```text
Content-Type: application/json; charset=utf-8
```

正文应是前面展示的 `{ "total": 3, "users": [...] }`，其中依次包含 Alice、Bob、Carol，角色分别为 `frontend`、`backend`、`designer`。日期、连接等其他响应头与这里的验证无关。

### 2. 检查页面消费结果

- 在核心示例页点击按钮，列表应显示三个用户；浏览器 Network 面板中的 `/api/mock/users` 应返回 `200` 和相同 JSON。
- 打开 <http://localhost:5215/>，点击“请求 mock 接口”，Home 应显示同样的姓名与角色。
- 打开 <http://localhost:5215/plugin-lab/code-generation>，“生成的用户 API”会在页面挂载后自动调用 `getUsers()`，也应显示同样的数据。

这个插件只注册 HTTP 中间件，不参与模块的 `resolveId`、`load` 或 `transform`，所以不要用 Inspect 的模块转换管线判断它是否生效；直接看 Network 或 `curl` 结果。

### 3. 对比生产构建与 preview

如需观察生产行为，可以在另一个终端执行：

```bash
pnpm build
pnpm exec vite preview --port 5315 --strictPort
```

再打开 <http://localhost:5315/plugins/dev-server/mock-api> 并点击按钮。预期结果是：**不会出现三个用户，页面会在错误区域显示请求或 JSON 解析错误。**

具体错误文案取决于静态服务的回退方式：

- 如果 `/api/mock/users` 返回 `404`，示例页的 `response.ok` 检查会抛出 `HTTP 404`。
- 如果 SPA 回退（把未知页面路径转向 `index.html` 的机制）返回 HTML，状态码可能仍是 `200`，但 `response.json()` 无法把 HTML 当作 JSON 解析，同样会进入错误分支。

这不是构建遗漏了数据，而是插件根本没有提供生产接口：`vite build` 会跳过 `apply: 'serve'` 插件；`vite preview` 只预览静态产物，也不会执行开发服务器的 `configureServer`。本插件没有 `configurePreviewServer`，所以 preview 中同样没有这个 Mock 中间件。

要验证完整生产链路，必须在真实部署环境中为 `/api/mock/users` 提供可访问的接口。`vite preview` 成功启动并不等于生产后端已经就绪。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 本例的限制与生产边界

- 这是讲解 Vite 钩子的最小服务端 Mock：数据固定，不持久化，也没有请求体验证、查询过滤、鉴权、延迟或错误场景。
- 当前处理函数没有检查 `req.method`，所以命中该挂载路径的其他 HTTP 方法也会得到同一份 JSON；不要把它当作只允许 GET 的完整路由实现。真实接口应显式校验方法和子路径，并返回合适的 `405`、错误正文及 `Allow` 响应头。
- 页面使用根绝对路径 `/api/mock/users`。部署到子路径或前后端分离域名时，`fetch` 不会自动拼接 `import.meta.env.BASE_URL`；需要通过真实网关、代理或环境配置确定 API 地址，跨源时还要处理 CORS。
- `configurePreviewServer` 可以扩展本地 preview，但它依然不是生产部署方案。生产环境应由真实后端、网关或专门的 Mock 服务提供数据。
- MSW 主要在浏览器或测试进程中拦截请求，便于模拟网络层行为并复用到测试；需要完整 Mock 数据平台、按需切换场景或跨进程复用时，应选择合适的专用方案，而不是无限扩展本插件。

:::

::: details 常见坑

- **把非 2xx 当作 `fetch` 自动抛错**：`fetch` 只有网络失败等情况才拒绝 Promise，`404`、`500` 仍可能正常返回 `Response`，所以核心示例显式检查 `response.ok`。
- **只写响应头，忘了序列化**：`Content-Type` 只是元数据；正文仍须由 `JSON.stringify` 生成。
- **结束响应后又调用 `next()`**：后续中间件可能再次写入同一响应。当前实现用 `res.end()` 完成请求，因此不再放行。
- **把页面路由和 API 路由混为一谈**：前者由 Vue Router 渲染组件，后者由 Connect 返回数据；直接刷新页面还依赖 HTML 的 SPA 回退，而 API 请求不应被改写成页面。
- **在 Inspect 中找不到插件就以为未注册**：`configureServer` 不属于模块转换管线，应该观察真实 HTTP 请求。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；生成 `getUsers()` 的另一条消费链见 [JSON 生成模块](../code-generation/01-generated-modules.md)。
