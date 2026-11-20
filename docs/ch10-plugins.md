# ch10 Vite 插件机制（预计 70 分钟）

## 本章目标

1. 说清 Vite 插件与 Rollup/Rolldown 插件的关系。
2. 掌握常用钩子的执行时机与顺序。
3. 亲手写四种插件：虚拟模块、HTML 注入、dev 中间件、构建期代码改写。
4. 会用 `vite-plugin-inspect` 观察插件管线。
5. 知道 `enforce` / `apply` 什么时候用。

## 前置

完成 ch09。

## 一、插件是什么

Vite 插件就是一个带 `name` 和若干钩子函数的对象：

```ts
export function myPlugin(): Plugin {
  return {
    name: 'my-plugin',      // 必填，用于日志与去重
    enforce: 'pre',         // 可选：排序
    apply: 'build',         // 可选：只在 build / serve 生效
    transform(code, id) {   // 钩子
      return code
    },
  }
}
```

Vite 的插件接口**兼容 Rollup 的钩子**（Vite 8 下是 Rolldown），所以：

- 纯构建相关的 Rollup 插件大多能直接用。
- Vite 额外提供 dev 专用钩子（`configureServer`、`transformIndexHtml`、`handleHotUpdate` 等）。

## 二、钩子执行顺序

```text
config                ← 修改配置（可返回新配置）
configResolved        ← 配置定稿，只读
configureServer       ← 仅 dev：挂中间件
options / buildStart  ← 构建开始
resolveId             ← 模块解析（谁是虚拟模块、往哪找）
load                  ← 读取模块内容（虚拟模块在这里返回源码）
transform             ← 转译（TS、Vue、你的改写）
transformIndexHtml    ← 处理 index.html
renderChunk           ← 每个 chunk 生成后（构建期）
generateBundle        ← 产物写盘前（构建期）
closeBundle           ← 收尾
```

排序规则：

1. `enforce: 'pre'` 的插件排最前
2. 普通插件按数组顺序
3. `enforce: 'post'` 排最后
4. Vite 内置插件穿插其中（`@vitejs/plugin-vue` 属于普通插件）

## 三、四个插件逐个拆解

### 1. `plugins/virtual-app-info.ts` — 虚拟模块

```ts
resolveId(id) {
  if (id === VIRTUAL_ID) return RESOLVED_ID   // '\0virtual:app-info'
},
load(id) {
  if (id !== RESOLVED_ID) return
  return `export default ${JSON.stringify(info)}`
},
```

- `\0` 前缀是社区约定：表示「这不是真实文件路径」，防止被后续插件再解析。
- 虚拟模块适合：版本信息、自动生成的配置、编译期常量、代码生成。

要让它有类型，需要 `declare module 'virtual:app-info'`（见 `src/types/plugins.d.ts`）。

### 2. `plugins/append-build-stamp.ts` — HTML 注入

```ts
transformIndexHtml() {
  return {
    tags: [{ tag: 'meta', attrs: { name: 'build-stamp', content: stamp }, injectTo: 'head' }],
  }
}
```

比起自己拼字符串，返回 `tags` 能保证插入位置正确、与 Vite 的其他 HTML 处理不打架。

### 3. `plugins/mock-api.ts` — dev 中间件

```ts
apply: 'serve',
configureServer(server) {
  server.middlewares.use('/api/mock/users', (req, res) => { ... })
},
```

- `apply: 'serve'` 保证构建时完全不执行。
- 适合本地 mock、代理兜底、预览服务扩展。
- 生产环境的 mock 应该由后端或 MSW 承担，不要指望插件。

### 4. `plugins/strip-debug.ts` — 构建期代码改写

```ts
apply: 'build',
enforce: 'pre',
transform(code, id) {
  if (!id.includes('/src/') || !code.includes('console.debug')) return
  const cleaned = code.split('\n').filter((l) => !/^\s*console\.debug\(/.test(l)).join('\n')
  return { code: cleaned, map: null }
}
```

要点：

- `enforce: 'pre'` 在 Vue/TS 转译前执行，拿到的更接近源码。
- 匹配 `id` 时注意它是绝对路径，应该用 `includes` 而不是 `===`。
- 返回 `map: null` 表示不提供 sourcemap；真实插件应生成 sourcemap，否则调试体验会退化。
- **不要用正则做复杂的代码改写**，生产级插件应使用 AST（如 `oxc-parser` / `@babel/parser`）。

> 真实项目里的六类高频自研场景与选型判断，见 [附录：插件的高频使用场景](./appendix-plugin-scenarios.md)。

## 四、用 inspect 看管线

`vite-plugin-inspect` 会把每个模块经过的插件与耗时可视化：

```text
http://localhost:5173/__inspect/
```

### 先解决一个坑：关闭客户端鉴权

Vite 8 内置了 devtools 鉴权机制。独立打开 `__inspect/` 页面时，浏览器没有经过主页面的鉴权握手，会拿到 `401` 响应，导致页面黑屏、什么都不显示。

在 `vite.config.ts` 里加一行：

```ts
devtools: {
  clientAuth: false,  // 允许直接访问 /__inspect/、/__vite-inspect/ 等独立页面
},
```

不加这行的话，你从主页面点进去可能没事，但直接在地址栏敲 `http://localhost:5173/__inspect/` 大概率是白/黑屏。

**但注意**：插件只在对应钩子被触发时才出现在某个模块的管线里，不会全部出现在每个模块上。

### 在 Home.vue 上能看到谁

左侧选 `/src/views/Home.vue` → 右侧 TRANSFORM STACK：

- `__load__` — Vite 内部 loader，读取 .vue 文件原始内容
- `vite:vue` — `@vitejs/plugin-vue` 编译 SFC
- `vite:import-analysis` — Vite 内置的 import 重写（把裸路径改成 `/@id/xxx`）

这三个是 dev 下 Home.vue 必经的 transform 链。**你的自定义插件一个都不会出现在这里**，原因见下。

### 自定义插件在哪看

| 插件 | 钩子 | 在 inspect 哪里看 |
|------|------|------------------|
| `lab:virtual-app-info` | `resolveId` + `load` | 左侧找 `virtual:app-info`（或 `\0virtual:app-info`），右侧 LOAD 区能看到它返回的 JSON |
| `lab:strip-debug` | `transform` + `apply: 'build'` | **dev 下不运行！** `pnpm build` 后构建期的 pipeline 里才会出现 |
| `lab:append-build-stamp` | `transformIndexHtml` | 左侧选 `/index.html`，或在 devtools Network 里看 HTML 响应的 `<meta name="build-stamp">` |
| `lab:mock-api` | `configureServer` | 这个挂的是中间件，不参与模块处理，inspect 里看不到。用浏览器 Network 或 `curl http://localhost:5173/api/mock/users` 验证 |

### 关键认识

**`vite-plugin-inspect` 展示的是「某一个模块」经过的插件管线**，不是「所有插件」的列表。

一个插件要出现在 inspect 里，必须满足：
1. 有 `transform` / `load` / `resolveId` 这类模块处理钩子（光有 `configureServer` / `transformIndexHtml` 不算）
2. 这个钩子**确实被该模块触发了**（比如 `strip-debug` 只在 build 期、只处理 src/ 下含 `console.debug` 的文件）
3. `apply` 没有把它排除在当前模式之外

## 五、动手步骤

1. 启动 dev：

   ```bash
   pnpm dev
   ```

2. 首页「自定义插件」面板应显示 `vite-learning@0.1.0 · vite ^8.3.8` 与一个时间戳——这是虚拟模块的内容，磁盘上不存在这个文件。

3. 点「请求 mock 接口」，应出现三个用户。

   用命令行验证：

   ```bash
   curl http://localhost:5173/api/mock/users
   ```

4. 打开 <http://localhost:5173/__inspect/>：
   - 左侧选 `/src/views/Home.vue`，确认 transform 链是 `__load__` → `vite:vue` → `vite:import-analysis`
   - 左侧搜索 `virtual:app-info`（或滚动到 `\0virtual:app-info`），右侧能看到 `lab:virtual-app-info` 插件的 load 结果
   - `lab:strip-debug` dev 下不运行，构建后才会参与管线

5. 生产构建：

   ```bash
   pnpm build
   grep -o '<meta name="build-stamp"[^>]*>' dist/index.html
   grep -c "console.debug" dist/assets/*.js   # 应该是 0
   ```

6. 把 `stripDebugPlugin()` 从 `plugins` 数组里注释掉，重新构建，再检查 `console.debug`——它又出现了。这证明插件确实参与了构建。

## 观察点

- 虚拟模块在 DevTools 的 Network 里请求路径是 `/@id/__x00__virtual:app-info`（`\0` 被编码）。
- `strip-debug` 只影响 `src/` 下的模块，`node_modules` 与插件自身不受影响。
- `mock-api` 在 `pnpm build` 时不会报错也不会执行（`apply: 'serve'`）。

## 检查点

- [ ] 页面显示虚拟模块内容
- [ ] `curl /api/mock/users` 返回 JSON
- [ ] `/__inspect/` 能看到插件链
- [ ] 产物 HTML 含 `build-stamp`
- [ ] 产物 JS 中 `console.debug` 数量为 0

## 常见坑

- **虚拟模块忘了 `\0` 前缀** → 可能被其他插件当成真实文件，报「文件不存在」。
- **`transform` 里对 `id` 用 `===` 比较** → id 是绝对路径（dev 下还带 query），永远匹配不上。
- **`apply` 写错** → `'serve'` / `'build'` 只接受这两个值。
- **插件里用了浏览器 API** → 插件运行在 Node 环境。
- **在 `transform` 里做异步重活** → 每个模块都会经过，很容易拖慢启动；能缓存就缓存。
- **忘记给虚拟模块加类型声明** → TS 报「找不到模块」。

## 进阶（可跳过）

- `handleHotUpdate`：自定义哪些文件变化触发 HMR。
- `configurePreviewServer`：给 `vite preview` 也挂中间件。
- 发布插件的最小结构：`package.json` 的 `exports` + `peerDependencies: { vite: '^8.0.0' }` + `name` 带前缀。
- 常用插件怎么选：见 [附录：开发必备插件清单](./appendix-plugins.md)。
- 阅读：<https://vite.dev/guide/api-plugin>

## 对照答案

```bash
git diff ch09 ch10
```
