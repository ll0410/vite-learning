# 11.4 预加载、modulepreload 与 chunkImportMap

代码分割的收益是首屏更小，代价是「用到时才下载」。如果用户点击路由后才开始请求 chunk，网络往返会直接体现为一段白屏或 loading。预加载解决的就是这段等待：在浏览器空闲或用户即将点击时，提前把 chunk 放进缓存。

::: tip 结论先行
- **适用**：已经做了路由懒加载，且路由切换有明显等待感的项目。
- **推荐**：保留 Vite 默认的 `modulepreload`；对高频路由在 hover / focus 时按需预热；`chunkImportMap` 先当实验能力评估。
- **代价**：预取会占用带宽，预取过多会拖慢首屏真正需要的资源。
- **不要**：首屏一次性预取所有路由；也不要在没有测量前关闭 `modulepreload`。
:::

## 问题与判断

先区分三种「提前」：

| 手段 | 触发时机 | 适合 |
| --- | --- | --- |
| `modulepreload` | HTML 解析时，预加载入口静态依赖 | 首屏必须的 chunk |
| 路由预取 | hover / focus / idle 时调用 `import()` | 用户很可能访问的下一页 |
| `chunkImportMap` | 构建期生成 import map | 多 chunk 长期缓存，实验性 |

如果首屏已经只加载入口和 vendor，且路由切换在本地很快，不一定需要额外预取。生产环境要看真实网络下的 chunk 请求耗时，再决定是否加。

## 做法

### 1. 理解默认的 modulepreload

Vite 默认开启 `build.modulePreload`，会为入口的静态依赖注入：

```html
<link rel="modulepreload" href="/assets/vendor-vue-*.js">
<link rel="modulepreload" href="/assets/rolldown-runtime-*.js">
```

这意味着浏览器在解析 HTML 时就开始下载这些 chunk，而不是等入口 JS 执行到 `import` 才发起请求。

默认还会注入 modulepreload polyfill，照顾不支持该特性的浏览器。现代浏览器项目可以评估关闭，减少一点体积：

```ts
build: {
  modulePreload: {
    polyfill: false,
  },
}
```

关闭前先确认目标浏览器范围。`build.target` 默认是 `baseline-widely-available`，如果团队仍要覆盖较旧浏览器，保留 polyfill 更稳妥。

### 2. 裁剪动态导入的预加载依赖

`modulePreload.resolveDependencies` 是实验性能力，可以在构建期决定「某个动态导入要预加载哪些依赖」：

```ts
build: {
  modulePreload: {
    polyfill: false,
    resolveDependencies(filename, deps) {
      // 示例：过滤掉不需要预加载的依赖，返回最终列表
      return deps.filter((dep) => !dep.includes('legacy'))
    },
  },
}
```

它的签名是 `(filename, deps, context) => string[]`，`context` 包含 `hostId` 和 `hostType`（`html` 或 `js`）。**接入前需验证与 Vite 8 / Rolldown 1.2.19 的兼容性**，并确认过滤后不会造成新的请求瀑布。

### 3. 按交互预取路由

最稳妥的预取不是「首屏全预取」，而是「用户表现出意图时再预取」。下面是一段**示例，按需加入**：

```ts
const prefetched = new Set<string>()

function prefetchRoute(key: string, loader: () => Promise<unknown>) {
  if (prefetched.has(key)) return
  prefetched.add(key)
  loader().catch(() => prefetched.delete(key))
}

// 在导航项上使用
// <RouterLink
//   to="/dashboard"
//   @mouseenter="prefetchRoute('dashboard', () => import('@/views/Dashboard.vue'))"
//   @focus="prefetchRoute('dashboard', () => import('@/views/Dashboard.vue'))"
// >
```

要点：

- 用 `Set` 去重，避免 hover 多次重复请求。
- 失败时从集合里移除，允许下次重试。
- 预取函数和路由表里的 `import()` 指向同一模块，构建器会复用同一个 chunk。
- 不要对所有导航项在 `mounted` 时批量预取，那等于把懒加载又变回首屏加载。

如果确实想利用空闲时间，可以对「下一步最可能访问」的一两个路由使用 `requestIdleCallback`，并设置超时；仍然不要全量预取。

### 4. chunkImportMap 是什么

`build.chunkImportMap` 是实验性选项，默认 `false`：

```ts
build: {
  chunkImportMap: true,
}
```

它让 chunk 之间通过 import map 的稳定标识互相引用，而不是把对方的哈希文件名写死。好处是某个 chunk 内容变化时，引用它的 chunk 不必跟着改哈希，缓存粒度更细。代价是：

- 需要浏览器支持 import maps。
- 产物结构更复杂，调试和部署工具要能识别。
- 它优化的是**缓存稳定性**，不直接减少首屏体积。

**接入前需验证兼容性**，并先回答「当前缓存失效造成的重复下载是否真的是瓶颈」。如果每次发版本来就会整体更新，收益有限。

## 在本仓库验证

### 1. 看默认的 modulepreload

```bash
pnpm build
grep -o '<link rel="modulepreload"[^>]*>' dist/index.html
```

预期能看到入口依赖的 preload 标签。再启动预览：

```bash
pnpm preview
```

DevTools → Network 筛选 JS，首屏应该直接请求这些 chunk，而不是等入口执行后才发现。

### 2. 观察路由预取

启动 dev：

```bash
pnpm dev
```

在导航项上加入 hover 预取后，把鼠标移到「Dashboard」但先不点击，Network 应出现 `Dashboard-*.js` 请求；随后点击进入，响应应从缓存或已完成请求中直接取得。

### 3. 对比 chunkImportMap

```bash
pnpm build
grep -o 'importmap' dist/index.html
```

开启 `chunkImportMap: true` 前后各构建一次，对比 `dist/index.html` 与 `dist/assets` 的引用方式。若产物或预览行为异常，先关闭该实验选项，不要把它当成必选项。

## 常见坑

- **首屏预取所有路由**：把懒加载的收益全部抵消，首屏请求数和体积都会回升。
- **关闭 polyfill 但目标浏览器较旧**：旧浏览器不支持 modulepreload，可能退化为串行加载。
- **`resolveDependencies` 过滤过头**：依赖没预加载，运行时仍然要补请求，反而多一次往返。
- **预取失败没有清理**：`Set` 里一直保留失败标记，后续不再重试。
- **把 chunkImportMap 当体积优化**：它主要影响缓存粒度，不保证首屏更小。
- **预取和路由加载指向不同模块**：例如预取 `@/views/Dashboard.vue`，路由却写 `../views/Dashboard.vue`，构建器可能生成不同 chunk。

## 延伸阅读

- [ch11 Code Splitting 代码分割](../ch11-code-splitting.md)
- [11.2 懒加载失败与发版后旧 chunk 404](./02-chunk-load-error.md)
- [11.3 Rolldown codeSplitting.groups 调优](./03-rolldown-groups.md)
- [Vite 官方文档：Build Options](https://vite.dev/config/build-options)
