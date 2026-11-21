# 组件自动注册、目录约定式路由

手动维护组件注册表和路由数组时，文件已经存在，却还要在另一处重复写名称、路径和 import。本例让插件扫描两个**明确受控的目录**，把目录结构直接变成应用可以使用的 JavaScript 模块。

## 先看懂：插件在做什么

一句话概括：**目录是数据源，虚拟模块是生成结果，应用消费的仍然是普通 JavaScript 数组。**

这里的“虚拟模块”是指：磁盘上没有与它对应的文件，模块源码由 Vite 插件在加载时生成。生成之后，Vite 会像处理普通模块一样解析其中的 `import` 和 `export`。

```text
受控目录中的 .vue 文件
        ↓ 扫描
插件生成 JavaScript 源码
        ↓
虚拟模块
        ├─ 组件注册表 → app.component → 模板直接使用组件
        └─ 路由记录数组 → Vue Router → 页面可以导航
```

下面先用组件注册看懂这个完整过程，再用同一套思路理解约定式路由。

## 第一个完整示例：自动注册一个组件

### 1. 输入：受控目录中的组件文件

组件目录中有一个文件：

```text
src/components/auto/LabAutoBadge.vue
```

业务代码导入的不是这个文件，而是下面这个虚拟模块：

```ts
import components from 'virtual:auto-components'
```

### 2. 生成：组件注册表模块

Vite 请求 `virtual:auto-components` 时，插件扫描组件目录。对于当前目录中的这个组件，生成的核心代码如下：

```ts
import Component0 from "/src/components/auto/LabAutoBadge.vue"

export default [
  { name: "LabAutoBadge", component: Component0 }
]
```

这段代码并没有提前保存在某个 `.ts` 文件中，而是插件的 `load` 钩子返回的字符串。文件名变成注册名，文件路径变成真实的组件 import。

### 3. 消费：遍历注册表并注册组件

`src/plugin-lab/setup/code-generation.ts` 导入这个数组，核心注册逻辑是：

```ts
components.forEach(({ name, component }) => {
  app.component(name, component)
})
```

对应用来说，虚拟模块与普通模块没有区别：拿到默认导出的数组，逐项处理即可。

### 4. 结果：模板不需要手写组件 import

完成全局注册后，示例模板可以直接使用 `<LabAutoBadge>`。新增组件文件时，也不需要再到另一个文件中补一条相同的 import 和注册语句。

## 虚拟模块是怎样被加载的

看完生成结果，再回头看三个关键钩子就容易多了：

- `configResolved`：保存项目根目录 `root`，从而确定要扫描的 `src/components/auto` 和 `src/views/conventional`。
- `resolveId`：认领 `virtual:auto-components` 和 `virtual:conventional-routes`，告诉 Vite“这些模块由本插件处理”。
- `load`：扫描对应目录，生成并返回前面看到的 JavaScript 源码。

`resolveId` 返回的内部 ID 会带一个 `\0` 前缀，例如 `\0virtual:auto-components`。它是 Rollup/Vite 虚拟模块的内部标识约定，可以避免被其他插件当作普通文件路径处理。**业务代码仍然只写不带 `\0` 的原始 ID。**

整个过程可以简化为：

```text
import 'virtual:auto-components'
  → resolveId 认领模块
  → load 扫描目录并返回源码
  → Vite 解析生成的 import 和 export
  → 应用拿到组件注册表
```

## 第二个完整示例：把页面文件变成路由

路由模块复用同一个思路，只是生成的数据从“组件注册项”变成了“Vue Router 路由记录”。

### 1. 输入：文件路径中的路由信息

本例使用三条简单约定：

| 页面文件（相对于 `src/views/conventional`） | 生成路径 | 生成名称 |
| --- | --- | --- |
| `index.vue` | `/conventional` | `conventional-index` |
| `about.vue` | `/conventional/about` | `conventional-about` |
| `users/[id].vue` | `/conventional/users/:id` | `conventional-users-id` |

末尾的 `index` 会归入父级路径；方括号表示动态参数，所以 `[id]` 在路由路径中变成 `:id`，在路由名称中只保留 `id`。

### 2. 生成：包含动态导入的路由记录

以 `users/[id].vue` 为例，生成的虚拟模块中会有下面这条记录（这里省略其他页面记录）：

```ts
export default [
  {
    path: "/conventional/users/:id",
    name: "conventional-users-id",
    component: () => import("/src/views/conventional/users/[id].vue"),
  },
]
```

关键不只是生成 `path` 和 `name`，还要生成真实的 `component: () => import(...)`。否则得到的只是一份路由信息数据，Vue Router 无法据此加载页面。

### 3. 消费：展开进真实路由数组

`src/plugin-lab/routes/code-generation.ts` 直接展开虚拟模块的默认导出：

```ts
import conventionalRoutes from 'virtual:conventional-routes'

export const codeGenerationRoutes = [
  // 分类示例页……
  ...conventionalRoutes,
]
```

### 4. 结果：文件路径变成可访问页面

创建 `users/[id].vue` 后，就得到了 `/conventional/users/:id` 路由，因此可以访问 `/conventional/users/42`。页面可以通过 RouterLink 导航，也可以直接刷新加载。

### 组件与页面为什么使用不同的 import

| 生成内容 | 导入方式 | 加载特点 |
| --- | --- | --- |
| 组件注册表 | `import Component0 from "..."` | 静态导入，组件与注册表一起进入依赖图 |
| 页面路由 | `() => import("...")` | 动态导入，访问路由时加载页面，生产构建可拆成独立 chunk |

全局注册希望应用启动后就能使用组件，所以采用静态导入；页面路由希望按需加载，所以采用动态导入。

## 对照真实源码阅读

完整实现位于 `plugins/code-generation/auto-discovery.ts`，可以按下面的对应关系阅读：

| 要理解的步骤 | 源码位置 | 作用 |
| --- | --- | --- |
| 确定扫描目录 | `configResolved` 和 `directories` | 保存项目根目录，拼出组件与页面目录 |
| 递归收集文件 | `scanVueFiles` | 找出所有 `.vue` 文件并排序，保证生成结果稳定 |
| 生成文件导入路径 | `rootImport` | 把绝对文件路径转成 `/src/...` 形式，并统一路径分隔符 |
| 生成单条路由 | `routeRecord` | 处理 `index`、动态参数、路由名称和动态 import |
| 提供虚拟模块 | `resolveId`、`load` | 认领模块 ID，扫描目录并返回生成的源码 |
| 处理目录结构变化 | `configureServer` | 监听新增和删除，更新生成清单 |

插件由 `plugins/code-generation/index.ts` 中的 `codeGenerationPlugins()` 注册。两个虚拟模块的类型声明位于 `src/types/code-generation.d.ts`，分别描述组件注册项数组和 `RouteRecordRaw[]`。

## 开发时：修改文件与新增文件有什么不同

目录监听的关键，是区分“文件内容变了”和“文件清单变了”：

| 文件变化 | 生成清单是否变化 | 更新方式 |
| --- | --- | --- |
| 修改已有 `.vue` 的内容 | 否 | 使用 Vite/Vue 默认更新，无需重新扫描目录 |
| 新增或删除 `.vue` 文件 | 是 | 失效对应虚拟模块，并触发整页刷新 |

新增或删除文件后，旧虚拟模块仍然保存着上一次的文件清单。`configureServer` 因此监听 `add` 和 `unlink`，并执行两个动作：

- `invalidateModule`：丢弃旧的生成结果，下次请求时重新执行 `load`。
- `full-reload`：重新执行组件注册和路由创建，让应用使用新清单。

`load` 中的 `this.addWatchFile(file)` 则把扫描到的源文件登记为虚拟模块依赖，让 Vite 知道这些文件与生成模块之间的关系。

## 验证步骤

### 1. 检查页面结果

运行 `pnpm exec vite --port 5211`，访问 `http://localhost:5211/plugin-lab/code-generation#auto-discovery`。

预期结果：徽章正常渲染；约定式首页、About 和用户 ID 页面都可以导航。直接刷新 `/conventional/about` 和 `/conventional/users/42`，页面仍应正常加载。

### 2. 检查生成结果

打开 Inspect，搜索 `virtual:auto-components` 与 `virtual:conventional-routes`，也可以直接请求：

```bash
curl http://localhost:5211/@id/__x00__virtual:auto-components
curl http://localhost:5211/@id/__x00__virtual:conventional-routes
```

预期结果：组件模块包含静态 import 和注册项；路由模块包含生成路径、名称以及 `() => import(...)`，与前面的示例一致。

### 3. 检查目录结构更新

在一个受控目录中临时新增 `.vue` 文件。

预期结果：页面刷新后，对应虚拟模块出现新条目；删除该文件后，条目消失。修改已有文件内容时，不应为了更新内容而重新生成整个文件清单。验证用的临时文件不要提交。

### 4. 检查生产构建结果

运行 `pnpm build`，再用 `pnpm exec vite preview --port 5311` 启动产物服务。

预期结果：About、动态用户等页面生成各自的 JS chunk；直接访问上述路由时，对应 chunk 均能正常加载。

## 进阶参考

::: details 生产级实现还需补齐

- 完整约定需要处理嵌套路由、布局、404、可选/重复参数、路由优先级、别名、重定向和冲突检测；本例只实现 `index`、普通目录和 `[id]`。
- 全局注册适合真正高频的基础组件。大量组件应考虑按需自动导入、异步组件或局部导入，避免扩大初始依赖图和增加名称冲突。
- 生产插件应提供目录/schema 校验、重复组件名与路由名诊断、大小写跨平台测试、SSR 和类型生成，并覆盖新增目录、重命名等文件事件。
- 通用需求可评估成熟方案，而不是把本例的受控扫描器直接扩展成复杂框架。

:::

::: details 常见坑

- **全局注册不等于自动导入**：本例是在应用入口注册运行时组件；按需自动导入是在编译某个 SFC 时补 import，两者的打包和适用场景不同。
- **只生成数据却没有接入路由器**：必须由路由数组展开生成记录，否则 Inspect 中再正确也无法导航。
- **新增文件后只刷新 SFC**：虚拟模块缓存的仍是旧文件列表，必须失效虚拟模块；整页刷新还会重新执行组件注册和路由创建。
- **路由顺序错误**：通配 404 如果排在生成记录之前，就会先截获页面；项目已保证分类路由位于 404 前。
- **dev 路径与源码目录冲突**：分类示例使用 `/plugin-lab/code-generation`，避免 `/plugins/code-generation` 命中根目录下的真实 `plugins/code-generation/index.ts`。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；如果想对照不依赖目录扫描的虚拟模块，可阅读 [纯数据生成示例](./01-generated-modules.md)。
