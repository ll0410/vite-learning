# 组件自动注册、目录约定式路由

## 真实场景

设计系统组件在每个页面重复手写导入和注册，或页面文件与路由记录重复维护，都容易出现命名和路径漂移。本例扫描两个**明确受控的目录**，分别生成全局组件注册表和真实 Vue Router 记录：

- `src/components/auto/LabAutoBadge.vue` → 全局 `<LabAutoBadge>`。
- `src/views/conventional/index.vue` → `/conventional`。
- `src/views/conventional/about.vue` → `/conventional/about`。
- `src/views/conventional/users/[id].vue` → `/conventional/users/:id`。

第 1 项只从 JSON 导出路由数据，本项则把动态页面导入直接展开进 `codeGenerationRoutes`，可通过 RouterLink 导航，也可直接刷新页面。

## 核心钩子与数据流

- `configResolved` 保存项目 `root`，所有扫描都限定在两个目录中。
- `resolveId` 解析 `virtual:auto-components` 和 `virtual:conventional-routes`，返回带 `\0` 的 ID。
- `load` 递归扫描 `.vue` 文件并排序。组件模块使用静态 import 导出名称和组件；路由模块生成 `path`、`name` 和 `() => import(...)`。
- `configureServer` 监听目录内 `.vue` 的 `add`、`unlink`。文件结构变化时失效对应虚拟模块并整页刷新，避免沿用旧文件列表。

```text
components/auto/**/*.vue → virtual:auto-components
  → setupCodeGeneration(app) → app.component(name, component)

views/conventional/**/*.vue → virtual:conventional-routes
  → codeGenerationRoutes → router/index.ts → createRouter
```

## 最小实现

路由记录的关键不是导出普通 JSON，而是把页面动态导入放进真实记录：

```ts
const files = scanVueFiles(viewsDir)
const records = files.map((file) => `{
  path: ${JSON.stringify(toRoutePath(file))},
  name: ${JSON.stringify(toRouteName(file))},
  component: () => import(${JSON.stringify(toRootImport(file))}),
}`)

return `export default [${records.join(',')}]`
```

分类路由文件直接展开该默认导出：

```ts
import conventionalRoutes from 'virtual:conventional-routes'

export const codeGenerationRoutes = [
  // 分类示例页……
  ...conventionalRoutes,
]
```

组件侧由 `src/plugin-lab/setup/code-generation.ts` 遍历生成注册表并调用 `app.component`。示例模板没有手写 `LabAutoBadge` 的 import。动态路由 import 在生产构建时形成独立 chunk，全局组件的静态 import 则会进入包含注册模块的共享图。

## 配置接入

`plugins/code-generation/index.ts` 注册 `autoDiscoveryPlugin()`。共享骨架已在 `src/main.ts` 调用 `setupPluginLab(app)`，并在 404 之前展开 `pluginLabRoutes`，所以本项只修改本分类 setup 和 routes 文件，不修改应用入口或路由器。

`src/types/code-generation.d.ts` 分别声明组件注册项和 `RouteRecordRaw[]`，避免虚拟模块丢失类型。

## 验证步骤

1. 运行 `pnpm exec vite --port 5211`，访问 `http://localhost:5211/plugin-lab/code-generation#auto-discovery`，确认徽章正常渲染。
2. 点击三个约定式链接，确认首页、About 和用户 ID 页面可导航；在 `/conventional/about` 和 `/conventional/users/42` 直接刷新。
3. 打开 Inspect 搜索 `virtual:auto-components` 与 `virtual:conventional-routes`，检查扫描后的 import、路径和名称。也可直接请求：

   ```bash
   curl http://localhost:5211/@id/__x00__virtual:auto-components
   curl http://localhost:5211/@id/__x00__virtual:conventional-routes
   ```

4. 新增一个受控 `.vue` 文件，确认对应虚拟模块刷新后出现新条目；删除后条目消失。验证用的临时文件不要提交。
5. 运行 `pnpm build`，确认 About、动态用户等页面各自生成 JS chunk。用 `pnpm exec vite preview --port 5311` 启动产物服务后，直接访问上述路由并请求这些 chunk，确认均可加载。

## 生产级实现还需补齐

- 完整约定需要处理嵌套路由、布局、404、可选/重复参数、路由优先级、别名、重定向和冲突检测；本例只实现 `index`、普通目录和 `[id]`。
- 全局注册适合真正高频的基础组件。大量组件应考虑按需自动导入、异步组件或局部导入，避免扩大初始图和增加名称冲突。
- 生产插件应提供目录/schema 校验、重复组件名与路由名诊断、大小写跨平台测试、SSR 和类型生成，并覆盖新增目录、重命名等文件事件。
- 通用需求可评估成熟方案，而不是把本例的受控扫描器直接扩展成复杂框架。

## 常见坑

- **全局注册不等于自动导入**：本例是在应用入口注册运行时组件；按需自动导入是在编译某个 SFC 时补 import，两者的打包和适用场景不同。
- **只生成数据却没有接入路由器**：必须由路由数组展开生成记录，否则 Inspect 中再正确也无法导航。
- **新增文件后只刷新 SFC**：虚拟模块缓存的仍是旧文件列表，必须失效虚拟模块；整页刷新还会重新执行 setup 和路由创建。
- **路由顺序错误**：通配 404 必须先于生成记录就会截获页面；共享骨架已保证分类路由位于 404 前。
- **dev 路径与源码目录冲突**：本分类示例使用 `/plugin-lab/code-generation`，避免 `/plugins/code-generation` 命中根目录下的真实 `plugins/code-generation/index.ts`。

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)，纯数据生成对照见 [第 1 项](./01-generated-modules.md)。
