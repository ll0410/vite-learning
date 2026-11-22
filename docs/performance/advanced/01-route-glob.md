# 11.1 批量懒加载：import.meta.glob 与路由分组

路由少的时候，手写 `component: () => import('@/views/About.vue')` 最直观。路由一多，重复的动态导入既容易漏，也会让 `src/router/index.ts` 变成一长串复制粘贴。`import.meta.glob` 把「目录里的页面文件」一次性映射成懒加载函数，适合按目录批量注册路由。

::: tip 结论先行
- **适用**：同一目录下有一批结构一致、都适合懒加载的页面路由（通常 5 个以上）。
- **推荐**：`import.meta.glob('../views/*.vue')` 保持默认的 `eager: false`，再对首页、404 等特殊页面显式注册。
- **代价**：路由路径由文件名推导，命名规范要先定好；glob 参数必须是字面量，不能拼变量。
- **不要**：为了少写几行就用 `eager: true`，那会退回静态导入，拆分效果消失。
:::

## 问题与判断

手写路由的问题不在「写起来累」，而在「容易不一致」：新增页面忘记注册、路径和文件名对不上、某个页面误写成静态导入导致首屏变大。

出现下面情况时，值得改成批量注册：

- 页面文件集中放在 `src/views/`，命名有稳定规律。
- 大多数页面首屏用不到，应该懒加载。
- 团队经常新增页面，希望减少路由文件的改动。

只有两三个路由，或者每个路由都需要单独的 meta、权限和布局时，继续显式写更清楚，不必为了「自动」增加一层推导。

## 做法

### 1. 用 glob 拿到「路径 → 动态导入函数」映射

在 `src/router/index.ts` 中，glob 的匹配模式是**相对当前文件**的：

```ts
const viewModules = import.meta.glob('../views/*.vue')
```

默认 `eager: false`，返回结构大致是：

```ts
{
  '../views/About.vue': () => import('../views/About.vue'),
  '../views/Assets.vue': () => import('../views/Assets.vue'),
  '../views/Dashboard.vue': () => import('../views/Dashboard.vue'),
  // ...
}
```

值本身就是 `() => import(...)`，可以直接交给 Vue Router 的 `component`，不需要再包一层。

### 2. 把文件名映射成路由

下面是一段**示例，按需加入**。它把 `About.vue` 映射为 `/about`，并跳过首页和 404 这类需要特殊处理的文件：

```ts
const viewModules = import.meta.glob('../views/*.vue')

const SPECIAL_VIEWS = new Set(['Home', 'NotFound'])

const autoRoutes = Object.entries(viewModules)
  .map(([file, component]) => {
    const name = file.replace('../views/', '').replace('.vue', '')
    return { name, component }
  })
  .filter(({ name }) => !SPECIAL_VIEWS.has(name))
  .map(({ name, component }) => ({
    path: `/${name.toLowerCase()}`,
    name: name.toLowerCase(),
    component,
  }))
```

然后把它展开到路由表里，顺序放在首页和 404 之间：

```ts
const routes = [
  { path: '/', name: 'home', component: Home },
  ...autoRoutes,
  ...pluginLabRoutes,
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFound.vue'),
  },
]
```

`NotFound` 必须显式放在最后，否则自动注册的 `/notfound` 会和通配路由混在一起，语义不清。

### 3. 需要额外信息时，用白名单而不是全自动

如果部分页面需要 `meta`、权限或不同布局，建议保留一个显式配置表，只用 glob 补「没有特殊要求的页面」：

```ts
const pageMeta: Record<string, { title: string }> = {
  About: { title: '关于' },
  Dashboard: { title: '仪表盘' },
}

const autoRoutes = Object.entries(viewModules)
  .filter(([file]) => !SPECIAL_VIEWS.has(file.replace('../views/', '').replace('.vue', '')))
  .map(([file, component]) => {
    const name = file.replace('../views/', '').replace('.vue', '')
    return {
      path: `/${name.toLowerCase()}`,
      name: name.toLowerCase(),
      component,
      meta: pageMeta[name] ?? {},
    }
  })
```

### 4. chunk 名从哪里来

Vite / Rolldown 会为每个动态导入生成独立 chunk，chunk 名通常来自模块文件名（例如 `Dashboard-*.js`）。不要照抄 webpack 的 `/* webpackChunkName: "..." */` 魔法注释，它在当前构建链路里不负责命名。

需要控制分组时，用 `build.rolldownOptions.output.codeSplitting.groups`，见 [11.3 Rolldown 分组调优](./03-rolldown-groups.md)。

## 在本仓库验证

当前仓库的 `src/router/index.ts` 仍是显式注册，可以直接对照它观察现有 chunk：

```bash
pnpm build
ls dist/assets | grep -E 'About|Assets|Dashboard|NotFound'
```

预期能看到 `About-*.js`、`Assets-*.js`、`Dashboard-*.js`、`NotFound-*.js` 等独立文件。`Home` 是静态导入，不会单独出现。

启动 dev 后打开首页，DevTools → Network 筛选 JS：

```bash
pnpm dev
```

预期首屏只加载 `index-*.js`、`vendor-vue-*.js` 等入口依赖，不包含 `Dashboard-*.js`。点击导航进入 Dashboard 后，才出现对应 chunk。

如果你想试验批量注册，可以在本地临时加入上面的 `autoRoutes`，重新构建并确认：

- 新增页面文件后，`dist/assets` 自动多出对应 chunk。
- 把某个页面误设为 `eager: true` 后，该页面不再生成独立 chunk，首屏体积变大。

验证完请恢复 `src/router/index.ts`，不要把临时实验混进正式代码。

## 常见坑

- **glob 参数写成变量**：`import.meta.glob(dir + '/*.vue')` 无法在构建期静态分析，必须使用字面量。
- **误用 `eager: true`**：返回的是模块对象而不是导入函数，路由会失去懒加载效果。
- **路径推导冲突**：`About.vue` 和 `about/index.vue` 可能映射出相同路径；命名规范要提前统一。
- **把 404 自动注册**：通配路由需要显式放在最后，自动生成的 `/notfound` 不是同一个东西。
- **glob 匹配到非页面文件**：`*.vue` 之外的组件不要放进 `views/`，否则会被当成路由页面。
- **忘了类型**：`import.meta.glob` 的返回值类型较宽，必要时用 `RouteRecordRaw` 约束生成结果，避免拼错字段。

## 延伸阅读

- [ch11 Code Splitting 代码分割](../ch11-code-splitting.md)
- [11.3 Rolldown codeSplitting.groups 调优](./03-rolldown-groups.md)
- [Vite 官方文档：Glob Import](https://vite.dev/guide/features#glob-import)
