# ch12 Vite 性能优化（预计 60 分钟）

## 本章目标

1. 把「性能优化」拆成 dev 期与 build 期两条独立的问题。
2. 会生成并读懂产物分析报告（`dist/stats.html`）。
3. 会产出 `.gz` / `.br` 并量化压缩收益。
4. 建立一套可复用的性能检查清单，而不是背配置项。

## 前置

完成 ch11（代码分割是性能优化的前提）。

## 一、先分清两条链路

| | dev 期优化 | build 期优化 |
| --- | --- | --- |
| 关注点 | 启动速度、首屏编译量、HMR 延迟 | 产物体积、请求数、缓存、解析成本 |
| 手段 | 预构建、预热、减少转换模块数 | 代码分割、压缩、摇树、target |
| 工具 | `optimizeDeps`、`server.warmup`、`/__inspect/` | `visualizer`、`compression`、构建日志 |
| **不影响** | 生产产物 | 开发体验 |

**不要用 build 期的优化去解决 dev 慢，反之亦然。**

## 二、dev 期：本章新增配置

```ts
server: {
  warmup: {
    clientFiles: ['./src/main.ts', './src/App.vue', './src/views/Home.vue'],
  },
},
```

`warmup` 让 Vite 在启动时**提前转换**首屏会用到的模块，避免用户打开页面时现场编译。

配合 ch06 的 `optimizeDeps.include`，dev 期的「第一次打开慢」基本可以消除。

其他 dev 期手段（本章不新增代码，理解即可）：

| 手段 | 作用 |
| --- | --- |
| 避免 barrel 文件（`index.ts` 统一 re-export） | 减少无关模块的转换与请求 |
| 缩小 `optimizeDeps.include` 范围 | 避免预构建用不到的大包 |
| 用 `/__inspect/` 找「耗时最长的 transform」 | 定位具体是哪个插件/模块慢 |
| 减少深层相对路径 | 提高解析效率（收益较小） |

## 三、build 期：本章新增配置

```ts
build: {
  reportCompressedSize: true,
  sourcemap: false,
},
```

插件：

```ts
// 只在 ANALYZE=true 时启用
visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true })

// 构建时额外产出 .gz / .br
compression({ algorithms: ['gzip', 'brotliCompress'], threshold: 1024 })
```

- `stats.html` 用矩形面积表示模块体积，能一眼看出「谁把包撑大了」。
- `.gz` / `.br` 的体积可以和服务端（Nginx / CDN）的压缩策略对照，避免重复压缩或漏压缩。

## 四、动手步骤

1. 生成分析报告：

   ```bash
   pnpm build:analyze
   open dist/stats.html
   ```

   重点看三件事：

   - 最大的模块是谁（本项目是 `vue` + `vue-router`）。
   - 有没有**重复打包**的依赖（同一个库出现多次）。
   - 首屏 chunk（`index-*`）里有没有本该懒加载的东西。

2. 检查压缩产物：

   ```bash
   ls -lh dist/assets/*.br
   ```

3. 本地起 preview，用 Lighthouse 测一次：

   ```bash
   pnpm preview
   # 打开 http://localhost:4173，DevTools → Lighthouse → Performance
   ```

   记录 LCP、Transfer Size、Requests。

4. 对比实验（感受「优化前后的差距」）：

   - 把 `router/index.ts` 里的 Dashboard 改回静态导入，重新 `pnpm build`，比较 `index-*.js` 体积。
   - 再改回懒加载，确认体积回落。

5. 打开 Network，勾选 `Disable cache`，对比首屏加载的 chunk 数量与顺序。

## 五、本项目的真实数据

`pnpm build` 输出（Vite 8.3.8，本地 macOS）：

| 产物 | 原始体积 | gzip | brotli |
| --- | --- | --- | --- |
| `vendor-vue`（vue + vue-router） | 88.91 kB | 33.80 kB | 30.65 kB |
| `vendor-utils`（lodash-es + dayjs） | 26.97 kB | 10.70 kB | 9.35 kB |
| `index`（入口 + 首屏） | 8.11 kB | 3.92 kB | 3.37 kB |
| `Dashboard`（懒加载） | 1.08 kB | 0.75 kB | — |
| `format`（动态导入） | 0.31 kB | 0.23 kB | — |
| `index.css` | 2.84 kB | 1.09 kB | — |

**首屏实际 JS ≈ 97.6 kB 原始 / ≈ 38 kB gzip**（`index` + `vendor-vue` + `rolldown-runtime`）。

关键结论：

1. 首屏不包含 Dashboard 与 lodash（它们只在进入对应路由/点击按钮时才下载）。
2. brotli 比 gzip 再省约 10%，生产环境应优先开 brotli。
3. 框架本身占了首屏体积的 90% 以上——**这才是真实项目中优化的重点**。

## 六、优化检查清单

**体积**

- [ ] 首屏 JS 是否 ≤ 200 kB（gzip 前）？
- [ ] 有没有整包引入（`import _ from 'lodash'` 而不是 `lodash-es`）？
- [ ] `stats.html` 里有没有重复依赖？
- [ ] 图片是否按需加载、是否用了合适的格式（webp/avif）？
- [ ] 字体是否子集化、是否 `font-display: swap`？

**请求**

- [ ] 首屏请求数是否合理（HTTP/2 下 20~40 个正常）？
- [ ] 异步 chunk 是否只在需要时加载？
- [ ] `modulepreload` 是否覆盖了关键 chunk？

**缓存**

- [ ] 产物是否带内容 hash（默认是）？
- [ ] vendor 与业务代码是否分开，避免一次发版全部失效？
- [ ] `index.html` 是否配置了 `no-cache`？

**构建**

- [ ] `target` 是否与真实用户浏览器匹配（默认 `baseline-widely-available`）？
- [ ] 生产是否关闭 `sourcemap`（或上传到监控平台后删除）？
- [ ] 是否开启 gzip/brotli（构建期或服务端二选一）？

## 检查点

```bash
pnpm build:analyze
ls -la dist/stats.html
ls dist/assets/*.gz dist/assets/*.br | wc -l
pnpm build && ls -lh dist/assets/*.js
```

- [ ] `stats.html` 能打开且能定位到最大模块
- [ ] `.gz` 与 `.br` 都存在
- [ ] 能说出首屏 JS 的体积与构成
- [ ] 能解释「为什么首屏不加载 Dashboard 的 chunk」

## 常见坑

- **只优化 build，忽略 dev** → 团队每天多等几分钟启动，收益全被抵消。
- **vendor 全塞一个 chunk** → 改一行业务代码也会让整个大 chunk 缓存失效。
- **盲目上 `compression` 插件** → 如果 CDN/Nginx 已经压缩，产物里再加 `.gz` 只会增加部署体积；二选一。
- **`sourcemap: true` 直接发布** → 源码泄露；应上传到 Sentry 等平台后删除。
- **只看 Lighthouse 总分** → 分数受设备/网络影响大，应该看具体指标与体积。
- **`target` 设得过低** → 引入大量 polyfill/降级代码，体积反而变大。

## 进阶（可跳过）

- `vite-plugin-imagemin` / `vite-imagetools`：图片压缩与格式转换。
- `@vitejs/plugin-legacy`：兼容老浏览器的双产物方案（体积代价很大）。
- `build.chunkImportMap` + HTTP/2：更细粒度的缓存策略。
- SSR / 预渲染（`vite-plugin-ssr`、`vite-ssg`）：首屏性能的下一步。

## 对照答案

```bash
git diff ch11 ch12
```
