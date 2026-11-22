# 性能优化指南

性能问题要分两条链路看：**dev 期**关注启动速度、首屏编译量和 HMR 延迟；**build 期**关注产物体积、请求数、缓存和解析成本。用 build 期的手段去解决 dev 慢，或者反过来，通常都事倍功半。

本专栏先用 ch11 建立代码分割的心智模型，再用 ch12 量化产物与压缩收益，最后用 9 篇进阶文档处理真实项目里更常见的问题：批量懒加载、发版后旧 chunk 404、vendor 分组调优、图片与字体、缓存与部署、体积预算和线上可观测性。

## 学习路径

| 阶段 | 内容 | 前置 | 预计 |
| --- | --- | --- | --- |
| 章节通关 | [11 Code Splitting 代码分割](./ch11-code-splitting.md) | 完成 ch10 | 50m |
| 章节通关 | [12 Vite 性能优化](./ch12-performance.md) | 完成 ch11 | 60m |
| 代码分割进阶 | [11.1 批量懒加载与路由分组](./advanced/01-route-glob.md) | 完成 ch11 | 15m |
| 代码分割进阶 | [11.2 懒加载失败与 chunk 兜底](./advanced/02-chunk-load-error.md) | 完成 ch11 | 20m |
| 代码分割进阶 | [11.3 Rolldown 分组调优](./advanced/03-rolldown-groups.md) | 完成 ch11 | 25m |
| 代码分割进阶 | [11.4 预加载与 chunkImportMap](./advanced/04-preload-and-importmap.md) | 完成 ch11 | 20m |
| 构建与部署进阶 | [12.1 图片与字体优化](./advanced/05-image-and-font.md) | 完成 ch12 | 25m |
| 构建与部署进阶 | [12.2 老浏览器兼容](./advanced/06-legacy-browsers.md) | 完成 ch12 | 15m |
| 构建与部署进阶 | [12.3 SSR、SSG 与预渲染](./advanced/07-ssr-and-prerender.md) | 完成 ch12 | 20m |
| 构建与部署进阶 | [12.4 缓存、CDN 与部署](./advanced/08-cache-and-deploy.md) | 完成 ch12 | 25m |
| 构建与部署进阶 | [12.5 体积预算与线上可观测性](./advanced/09-budget-and-observability.md) | 完成 ch12 | 25m |
| 附录 | [预压缩产物（.gz / .br）](./appendix-precompressed-assets.md) | 完成 ch12 | 10m |

## 章节通关

- [11 Code Splitting 代码分割](./ch11-code-splitting.md)：路由懒加载、组件级动态 `import()`、vendor 手动分组，读懂 `dist/assets` 里的 chunk 结构。
- [12 Vite 性能优化](./ch12-performance.md)：区分 dev 期与 build 期两条链路，生成 `dist/stats.html`，产出并对比 `.gz` / `.br`。

## 代码分割进阶（ch11 延伸）

- [11.1 批量懒加载：import.meta.glob 与路由分组](./advanced/01-route-glob.md)：路由多起来以后，用 glob 批量注册，避免手写重复的动态导入。
- [11.2 懒加载失败与发版后旧 chunk 404](./advanced/02-chunk-load-error.md)：`router.onError`、有限重试和一次性刷新，处理真实网络里的加载失败。
- [11.3 Rolldown codeSplitting.groups 调优](./advanced/03-rolldown-groups.md)：`priority`、`maxSize`、`entriesAware`、`$initial` 等字段的取舍。
- [11.4 预加载、modulepreload 与 chunkImportMap](./advanced/04-preload-and-importmap.md)：拆分之后如何减少「点击后才开始下载」的等待。

## 构建与部署进阶（ch12 延伸）

- [12.1 图片与字体：首屏体积的另一半](./advanced/05-image-and-font.md)：格式、`srcset`、字体子集化与 `font-display`。
- [12.2 老浏览器兼容：@vitejs/plugin-legacy 的代价](./advanced/06-legacy-browsers.md)：双产物什么时候值得开，什么时候只是增加体积。
- [12.3 SSR、SSG 与预渲染怎么选](./advanced/07-ssr-and-prerender.md)：从 SEO、首屏、部署和缓存四个维度做选型。
- [12.4 缓存、CDN 与部署产物](./advanced/08-cache-and-deploy.md)：把「体积变小」转化为「用户真正下载变少」。
- [12.5 体积预算、sourcemap 与线上可观测性](./advanced/09-budget-and-observability.md)：把性能检查变成 CI 门禁，并保留线上定位能力。

## 附录

- [预压缩产物（.gz / .br）](./appendix-precompressed-assets.md)：构建期预压缩与服务端压缩的分工、Nginx 配置和常见坑。

## 验证入口

```bash
# 1. 生成产物，观察 chunk 结构与体积
pnpm build
ls -lh dist/assets

# 2. 生成体积分析报告
pnpm build:analyze
open dist/stats.html

# 3. 本地预览，配合 Lighthouse 与 Network 面板
pnpm preview
```

观察顺序建议：先看构建日志里的首屏 chunk 与 gzip 体积，再看 `stats.html` 里最大的模块，最后用 `preview` 验证真实请求顺序和缓存头。
