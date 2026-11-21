# 自动生成 API 客户端、路由表、i18n 资源聚合

团队已经有一份受控的接口、页面或翻译描述时，重复手写客户端函数、路由数据和语言包聚合容易产生遗漏。本例让插件读取 JSON，在模块加载时生成应用可以直接导入的 JavaScript 源码。

本例源码是 `plugins/code-generation/generated-modules.ts`，输入位于 `src/plugin-lab/fixtures/codegen/`。三个示例都由插件生成模块，但生成结果并不相同：API 是可调用函数，路由是纯记录数据，i18n（国际化）是按语言编码聚合的消息对象。

## 先看懂：插件在做什么

一句话概括：**JSON 是数据源，虚拟模块是生成结果，页面消费的仍然是普通 JavaScript 导出。**

这里的“虚拟模块”是指：磁盘上没有与它对应的文件，模块源码由 Vite 插件在加载时生成。业务代码仍然使用 `import`，不需要读取 JSON，也不需要调用插件函数。

```text
api.json
  → virtual:generated-api 生成 request 和 getUsers()
  → CodeGenerationDemos.vue 的 loadUsers() 调用 getUsers()
  → 页面显示 Alice、Bob、Carol

routes.json
  → virtual:generated-routes 默认导出两条路由记录
  → CodeGenerationDemos.vue 遍历 generatedRoutes
  → 页面显示两行路由数据，但不注册真实路由

locales/zh-CN.json + locales/en-US.json
  → virtual:generated-i18n 默认导出聚合消息对象
  → CodeGenerationDemos.vue 根据 locale 读取 currentMessages
  → 页面显示中文或英文标题、问候语和按钮文案
```

下面先沿 API 这条链路看完整过程，再看另外两种生成结果，最后回头解释插件钩子。

## 第一个完整示例：从接口描述到用户列表

### 1. 输入：一项接口描述

`src/plugin-lab/fixtures/codegen/api.json` 当前只有一项：

```json
[
  {
    "name": "getUsers",
    "path": "/api/mock/users",
    "method": "GET"
  }
]
```

`name` 是要生成的函数名，`path` 和 `method` 是调用时要使用的请求路径与 HTTP 方法。业务代码导入的是虚拟模块，而不是这个 JSON 文件：

```ts
import { getUsers, type GeneratedUser } from 'virtual:generated-api'
```

### 2. 生成：带有请求辅助函数的模块

当前输入只有一项，因此 `load` 为 `virtual:generated-api` 返回的完整模块源码如下：

```ts
async function request(path, init) {
  const response = await fetch(path, init)
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}
export const getUsers = () => request("/api/mock/users", { method: "GET" })
```

这里发生了两层转换：

- `api.json` 中的描述项变成命名导出 `getUsers`，调用方不必重复写路径和方法。
- 插件额外生成 `request`，统一执行 `fetch`、检查 `response.ok` 并解析 JSON；非成功 HTTP 状态会抛出 `Request failed: 状态码`。

这段源码没有提前保存在某个 `.ts` 文件中，而是插件返回的字符串。Vite 拿到字符串后，会像处理普通模块一样处理其中的 `export`。

### 3. 消费：像普通函数一样调用

`src/views/plugins/categories/CodeGenerationDemos.vue` 中的 `loadUsers` 完整逻辑如下：

```ts
const users = ref<GeneratedUser[]>([])
const loading = ref(false)
const error = ref('')

async function loadUsers() {
  loading.value = true
  error.value = ''
  try {
    const response = await getUsers()
    users.value = response.users
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)
```

组件挂载时会自动调用一次，点击“重新调用 getUsers()”按钮也会再次调用。模板再把 `users` 渲染为列表：

```vue
<li v-for="user in users" :key="user.id">{{ user.name }} · {{ user.role }}</li>
```

`/api/mock/users` 由 `plugins/mock-api.ts` 在开发服务器中提供，返回 `{ total, users }`。本例使用其中的 `users` 数组。

### 4. 结果：页面出现真实请求返回的用户

访问示例页后，“生成的用户 API”面板应显示：

```text
Alice · frontend
Bob · backend
Carol · designer
```

因此，这条链路不是“插件直接生成用户列表”，而是：**插件生成客户端函数，函数请求 Mock API，组件把响应渲染成列表。**

## 第二个示例：从路由 JSON 到记录表格

### 1. 输入与生成结果

`src/plugin-lab/fixtures/codegen/routes.json` 描述两条记录：

```json
[
  {
    "path": "/users",
    "name": "user-list",
    "title": "用户列表"
  },
  {
    "path": "/users/:id",
    "name": "user-detail",
    "title": "用户详情"
  }
]
```

插件用 `JSON.stringify(routes, null, 2)` 序列化整个数组，`virtual:generated-routes` 的完整生成结果是：

```ts
export default [
  {
    "path": "/users",
    "name": "user-list",
    "title": "用户列表"
  },
  {
    "path": "/users/:id",
    "name": "user-detail",
    "title": "用户详情"
  }
]
```

与 API 示例不同，这里没有生成请求逻辑，也没有生成 `import`。它只是一个默认导出的 JavaScript 数组。

### 2. 消费与页面结果

示例页导入默认导出：

```ts
import generatedRoutes from 'virtual:generated-routes'
```

模板遍历 `generatedRoutes`，分别显示 `route.path`、`route.name` 和 `route.title`，最终得到：

| 路径 | 名称 | 标题 |
| --- | --- | --- |
| `/users` | `user-list` | 用户列表 |
| `/users/:id` | `user-detail` | 用户详情 |

**这两条记录只是表格数据，不会自动注册进 Vue Router。** 当前输入没有组件，生成代码也没有 `component` 或 `() => import(...)`，所以访问 `/users` 并不会由此得到用户页面。本页真正可访问的 `/plugin-lab/code-generation` 路由是在 `src/plugin-lab/routes/code-generation.ts` 中手写的；生成真实可导航路由的目录扫描示例见[本类第 3 项](./03-auto-discovery.md)。

## 第三个示例：把两份语言文件聚合成一个模块

### 1. 输入：按语言编码分开的 JSON

`src/plugin-lab/fixtures/codegen/locales/zh-CN.json`：

```json
{
  "title": "代码生成实验",
  "greeting": "你好，虚拟模块",
  "switchLabel": "Switch to English"
}
```

`src/plugin-lab/fixtures/codegen/locales/en-US.json`：

```json
{
  "title": "Code generation lab",
  "greeting": "Hello, virtual modules",
  "switchLabel": "切换到中文"
}
```

### 2. 生成：以语言编码为顶层键的对象

插件依次读取 `zh-CN` 和 `en-US`，用 `Object.fromEntries` 合并后再序列化。`virtual:generated-i18n` 的完整生成结果是：

```ts
export default {
  "zh-CN": {
    "title": "代码生成实验",
    "greeting": "你好，虚拟模块",
    "switchLabel": "Switch to English"
  },
  "en-US": {
    "title": "Code generation lab",
    "greeting": "Hello, virtual modules",
    "switchLabel": "切换到中文"
  }
}
```

一份语言模块因此依赖两个真实输入文件；任意一份变化，都需要重新生成整个聚合模块。

### 3. 消费与页面结果

示例页导入默认导出，并用 `locale` 选择当前语言：

```ts
import messages from 'virtual:generated-i18n'

const locale = ref<keyof typeof messages>('zh-CN')
const currentMessages = computed(() => messages[locale.value])

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
}
```

模板读取 `currentMessages.title`、`currentMessages.greeting` 和 `currentMessages.switchLabel`。初始语言是 `zh-CN`，所以页面先显示“代码生成实验”和“你好，虚拟模块”；点击“Switch to English”后，切换为“Code generation lab”和“Hello, virtual modules”，按钮文案变为“切换到中文”。

## 核心原理：虚拟模块怎样被加载

看完生成结果，再回头看插件钩子就容易多了。这里的“钩子”是 Vite 在特定阶段调用的插件函数。

| 钩子 | 本例中的作用 |
| --- | --- |
| `configResolved` | 保存项目根目录 `root`，用于定位 `src/plugin-lab/fixtures/codegen` |
| `resolveId` | 认领三个公共模块 ID，并返回插件内部使用的 ID |
| `load` | 读取对应 JSON，返回前面看到的 JavaScript 源码字符串 |
| `configureServer` | 仅在开发服务器中监听输入变化，清除旧生成结果并触发整页刷新 |

### 公共 ID 与内部 ID

真实源码定义了三个公共 ID：

```ts
const API_ID = 'virtual:generated-api'
const ROUTES_ID = 'virtual:generated-routes'
const I18N_ID = 'virtual:generated-i18n'

const resolvedIds = {
  api: `\0${API_ID}`,
  routes: `\0${ROUTES_ID}`,
  i18n: `\0${I18N_ID}`,
}
```

`resolveId` 原样完成下面的映射：

```ts
resolveId(id) {
  if (id === API_ID) return resolvedIds.api
  if (id === ROUTES_ID) return resolvedIds.routes
  if (id === I18N_ID) return resolvedIds.i18n
},
```

例如，业务代码写 `virtual:generated-api`，`load` 接收到的是 `\0virtual:generated-api`。`\0` 是 Rollup/Vite 虚拟模块的内部标识约定，用来避免其他插件继续把它当成磁盘路径处理。**`\0` 只出现在内部 ID 中，业务 import 不要添加它。**

未命中时 `resolveId` 返回 `undefined`，让 Vite 和其他插件继续解析。`load` 同样先检查 ID，只处理 `resolvedIds` 中的三个值。

### 生成代码时为什么要校验和序列化

API 的 `name` 会直接成为 `export const ...` 中的 JavaScript 标识符，也就是代码里的变量名称。插件先用 `/^[$A-Z_a-z][$\w]*$/` 检查字符形式，不合法时抛出 `Invalid generated API function name: ...`。

路径、方法、路由记录和翻译文本则通过 `JSON.stringify` 写入模块。这样引号、换行和中文等内容会成为合法的 JavaScript 数据，而不是靠手工拼接字符串碰运气。`load` 返回的是**源码字符串**，不是把 JSON 对象直接交给 Vite。

完整实现可按下表对照 `plugins/code-generation/generated-modules.ts` 阅读：

| 要理解的步骤 | 源码位置 |
| --- | --- |
| 定位四个输入文件及其所属模块 | `inputs()` |
| 同步读取并解析 JSON | `readJson` |
| 生成 API 函数并复用请求辅助逻辑 | `load` 中的 `resolvedIds.api` 分支 |
| 生成路由记录数组 | `load` 中的 `resolvedIds.routes` 分支 |
| 聚合两份语言资源 | `load` 中的 `resolvedIds.i18n` 分支 |
| 登记依赖、监听变化并失效模块 | `this.addWatchFile`、`configureServer` |

## 接入：插件、示例页和类型声明

### 1. 注册插件

`plugins/code-generation/index.ts` 已通过 `codeGenerationPlugins()` 注册本例：

```ts
export function codeGenerationPlugins(): Plugin[] {
  return [generatedModulesPlugin(), autoDiscoveryPlugin(), onDemandDataPlugin(), appInfoPlugin()]
}
```

`vite.config.ts` 在 `plugins` 数组中展开 `...codeGenerationPlugins()`，并注册了 `inspect()`。因此当前项目无需再改入口配置；如果在其他项目复用，则需要注册 `generatedModulesPlugin()`，并准备相同结构的输入文件。

### 2. 接入示例页，而不是把数据误接入路由器

`src/plugin-lab/routes/code-generation.ts` 把 `/plugin-lab/code-generation` 指向 `CodeGenerationDemos.vue`。该路由经 `src/plugin-lab/routes/index.ts` 汇总，再由 `src/router/index.ts` 展开到 404 路由之前。

真正导入 `virtual:generated-api`、`virtual:generated-routes` 和 `virtual:generated-i18n` 的地方只有示例组件 `CodeGenerationDemos.vue`。尤其不要把示例页路由的接入过程误认为 `virtual:generated-routes` 已完成 Vue Router 注册。

### 3. 为虚拟模块补充 TypeScript 类型

Vite 能执行生成的 JavaScript，并不意味着 TypeScript 自动知道模块导出的类型。`src/types/code-generation.d.ts` 为三个模块手写了声明：

| 模块 | 声明的主要导出 |
| --- | --- |
| `virtual:generated-api` | `getUsers(): Promise<GeneratedUsersResponse>`；响应含 `total` 和 `users`，用户含 `id`、`name`、`role` |
| `virtual:generated-routes` | 默认导出 `GeneratedRouteRecord[]`，每项含字符串字段 `path`、`name`、`title` |
| `virtual:generated-i18n` | 默认导出 `Record<'zh-CN' \| 'en-US', GeneratedMessages>`，消息含 `title`、`greeting`、`switchLabel` |

`tsconfig.json` 的 `include` 已覆盖 `src/**/*.d.ts`，所以示例导入时能获得类型检查。声明只服务于编译期检查，不会校验接口运行时返回的数据，也不会在 JSON 变化后自动更新。

## 开发时：JSON 变化后怎样得到新模块

虚拟模块没有可对应的磁盘文件，不能只依赖普通文件的热更新。这里的“模块失效”是指清除 Vite 模块图中缓存的旧生成结果，让下次请求重新执行 `load`；模块图就是 Vite 记录模块及其依赖关系的数据结构。

本例同时做了两件事：

1. `load` 对每个相关输入调用 `this.addWatchFile(input.file)`，把真实 JSON 登记为虚拟模块依赖。API 和路由各对应一个输入，i18n 对应两个输入。
2. `configureServer` 通过 `server.watcher.add(...)` 显式监听四个输入，并监听 `add`、`change`、`unlink` 事件。事件命中输入后，按内部 ID 找到模块，调用 `server.moduleGraph.invalidateModule(module)`，再发送 `full-reload`。

完整更新链路是：

```text
JSON 发生变化
  → watcher 找到它所属的虚拟模块
  → invalidateModule 清除旧 load 结果
  → full-reload 让浏览器重新请求应用
  → load 重新读取 JSON 并生成源码
  → 页面使用新导出
```

如果虚拟模块尚未进入模块图（例如尚未被浏览器请求），`invalidateInput` 会因为找不到旧模块而直接返回，因为还没有旧结果需要清除。生产构建不执行 `configureServer`；构建时 `resolveId` 和 `load` 仍会生成并打包模块，之后修改 JSON 需要重新构建，运行中的产物不会自行读取这些输入文件。

## 验证步骤

### 1. 检查三条页面链路

运行：

```bash
pnpm exec vite --port 5211
```

访问 `http://localhost:5211/plugin-lab/code-generation#generated-modules`。

预期结果：

- 用户面板显示 `Alice · frontend`、`Bob · backend`、`Carol · designer`，没有错误文本；点击“重新调用 getUsers()”会再次请求并显示同一组用户。
- 路由表格恰好显示 `/users`、`/users/:id` 两行及对应名称、标题。它们是数据展示，不要求这两个地址可以导航。
- 初始显示“代码生成实验 / 你好，虚拟模块”；点击“Switch to English”后显示“Code generation lab / Hello, virtual modules”，再点击“切换到中文”可切回。

### 2. 检查生成源码

打开 `http://localhost:5211/__inspect/`，搜索三个 `virtual:generated-*` 模块，查看 `lab:generated-modules` 的解析和加载结果。也可以直接请求：

```bash
curl http://localhost:5211/@id/__x00__virtual:generated-api
curl http://localhost:5211/@id/__x00__virtual:generated-routes
curl http://localhost:5211/@id/__x00__virtual:generated-i18n
```

URL 中的 `__x00__` 对应内部 ID 的 `\0`。预期响应分别包含：

- API：`async function request`，以及 `export const getUsers = () => request("/api/mock/users", { method: "GET" })`。
- 路由：默认导出的两条记录，不包含 `component`、页面 `import` 或 `createRouter`。
- i18n：默认导出的 `zh-CN` 和 `en-US` 两组消息，内容与两个输入 JSON 一致。

### 3. 检查输入变化后的重新生成

临时把 `src/plugin-lab/fixtures/codegen/locales/zh-CN.json` 的 `greeting` 改为 `你好，已重新生成`。

预期结果：开发服务器触发整页刷新；由于组件重新挂载，语言回到 `zh-CN`，页面直接显示新问候语。再次请求 `virtual:generated-i18n` 时，结果也应包含新值。验证后恢复为 `你好，虚拟模块`，页面和模块响应应再次同步恢复。

### 4. 检查生产构建与预览边界

运行 `pnpm build`。

预期结果：构建成功，三个公共虚拟模块 ID 都能被解析，不要求磁盘上存在同名文件；生成的函数、路由数据和两份语言资源进入生产 JavaScript。

如需检查产物页面，可运行 `pnpm exec vite preview --port 5311` 并访问同一路径。路由表格和中英文切换应继续工作，因为它们的数据已经打包；用户 API 则不会自动获得开发期 Mock 数据，页面会显示捕获到的请求或 JSON 解析错误。这是因为 `mockApiPlugin()` 使用 `apply: 'serve'`，不是虚拟模块构建失败。要验证完整生产链路，必须为 `/api/mock/users` 提供真实可访问的生产接口。

## 进阶参考

::: details 生产级实现还需补齐

- 用 OpenAPI、JSON Schema 等接口或数据描述规范生成请求参数、响应和错误类型，并处理查询参数、请求体、鉴权、取消请求及运行时数据校验。本例只生成无参数函数。
- 对描述文件做结构约束（schema）校验、跨文件冲突检测和诊断定位。本例只接受受控 JSON；JSON 语法错误或读取失败会让相应 `load` 失败。
- 当前函数名正则只检查字符形式，没有排除 JavaScript 保留字，也没有检查重名；生产生成器还需要这些校验，避免生成重复导出或语法错误。
- 大型语言包需要按语言或命名空间拆包、异步加载及缺失翻译键（key）回退。本例为了观察聚合结果，将两份小语言包放在同一模块，任意一份变化都会重新生成整体。
- 若要生成类型声明，应把声明输出纳入明确的构建流程，而不是依赖手写声明与描述长期保持同步。当前 `.d.ts` 也不会验证 API 的实际响应结构。
- 生成的 API 客户端只负责请求代码，不会生成服务端。开发和生产需要分别配置可用接口，不能把 `apply: 'serve'` 的 Mock 中间件当作生产能力。

:::

::: details 常见坑

- **漏掉 `\0`**：其他插件或 Node 解析可能继续处理虚拟 ID，得到错误的路径结果；但业务 import 应始终使用不带 `\0` 的公共 ID。
- **只 watch、不失效**：Vite 可能继续使用模块图中的旧 `load` 结果。文件事件、模块失效以及让应用重新消费模块的整页刷新缺一不可。
- **把路由数据当作真实路由**：导出数组不会自动调用 `createRouter`，当前记录甚至没有 `component`。本类第 3 项才生成页面动态导入并接入真实路由数组。
- **生成代码未序列化**：直接插入描述字符串容易遇到引号、换行或非法标识符，至少应使用 `JSON.stringify` 并校验名称。
- **以为类型声明会自动同步**：本例 `.d.ts` 是手写的。修改 JSON 字段或 API 响应后只重新生成模块，仍可能出现类型与运行结果不一致。
- **删除输入后期待自动回退**：插件虽然监听 `unlink`，但没有缺失文件回退逻辑；下一次 `load` 读取已删除文件时会失败。新增或删除文件也应保证受控输入结构完整。
- **dev 路径与源码目录冲突**：分类示例使用 `/plugin-lab/code-generation`，避免 `/plugins/code-generation` 命中根目录下真实的 `plugins/code-generation/index.ts`，被 dev 静态中间件当作页面响应。

:::

插件钩子基础见 [ch10 虚拟模块](../../guide/ch10-plugins.md)；如果想对照会扫描目录、生成真实组件导入和可导航路由的实现，可继续阅读[组件自动注册、目录约定式路由](./03-auto-discovery.md)。
