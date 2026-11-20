# 附录：插件的高频使用场景

[ch10](../guide/ch10-plugins.md) 中的四个插件是教学用的最小样本。真实项目里，自研插件基本集中在下面六类，按出现频率排序。

本附录的每个场景都配有一个可直接运行的最小实现，源码在根目录 `plugins/`，说明见各条目的指南链接。16 个场景可以在 `pnpm dev` 页面验证：启动开发服务后打开头部「插件」入口，按分类逐项操作。另外 7 个场景只对构建产物生效，没有等价的 dev 页面示例，指南中提供了可执行的 `pnpm build` 与产物断言命令。

## 1. 代码生成 / 虚拟模块（最高频）

`resolveId` + `load`

- 自动生成 API 客户端、路由表、i18n 资源聚合：[最小实现](./code-generation/01-generated-modules.md)
- 编译期常量：版本号、构建时间、Git commit、环境标识：[最小实现](./code-generation/02-build-constants.md)
- 组件自动注册、目录约定式路由（`unplugin-vue-router` 就是这套）：[最小实现](./code-generation/03-auto-discovery.md)
- 大体积静态数据（图标集、字典表）按需导出：[最小实现](./code-generation/04-on-demand-data.md)

价值在于：**把「需要人工同步的文件」变成「构建时自动生成」**，消除手写错误。

## 2. 构建期代码改写 / 裁剪

`transform` + `apply: 'build'`

- 移除 `console` / `debugger` / 测试代码（即 ch10 的 `strip-debug`）：[最小实现](./code-transform/01-strip-debug.md)
- 埋点自动注入（在组件挂载点插上报调用）：[最小实现](./code-transform/02-inject-tracking.md)
- 多租户 / 多品牌差异化：同一套代码产出不同包：[最小实现](./code-transform/03-tenant-build.md)
- 生产环境替换敏感配置、条件编译开关：[最小实现](./code-transform/04-conditional-build.md)

## 3. 按需导入 / 自动引入

`transform`（常配合 `config` 注册 alias）

这就是 `unplugin-auto-import`、`unplugin-vue-components` 的原理，国内团队几乎必配。自研版本通常是为了支持**公司内部组件库**的特殊目录结构或命名规则。最小实现见 [API 自动导入与组件按需引入](./auto-import/01-auto-import.md)。

## 4. HTML 注入

`transformIndexHtml`

- 注入 CDN、监控脚本（Sentry）、统计代码：[最小实现](./html-injection/01-inject-scripts.md)
- 注入 CSP `<meta>`、主题变量、首屏骨架：[最小实现](./html-injection/02-head-assets.md)
- 多页应用（MPA）按入口注入不同标签：[最小实现](./html-injection/03-mpa-entry.md)
- 注入 `<link rel="preconnect">` 做性能优化：[最小实现](./html-injection/04-preconnect.md)

ch10 的 `append-build-stamp` 就是最小版本。

## 5. dev server 中间件

`configureServer` + `apply: 'serve'`

- Mock API（即 ch10 的 `mock-api`）：[最小实现](./dev-server/01-mock-api.md)
- 本地代理的特殊逻辑、接口转发兜底：[最小实现](./dev-server/02-proxy-fallback.md)
- 调试接口：查看运行时配置、清缓存：[最小实现](./dev-server/03-debug-endpoints.md)
- 模拟 SSO 登录回调、文件上传：[最小实现](./dev-server/04-auth-upload.md)

## 6. 构建产物后处理

`generateBundle` / `writeBundle`

- 生成 `manifest.json` 给后端做 SSR / 资源映射：[最小实现](./build-output/01-ssr-manifest.md)
- 产物加 hash 版本文件、CDN 上传清单：[最小实现](./build-output/02-deployment-artifacts.md)
- 生成 SRI 校验、`robots.txt`、`_headers`：[最小实现](./build-output/03-static-deployment.md)
- 产物内容替换（比如替换占位域名）：[最小实现](./build-output/04-replace-built-assets.md)

## 另外两类，频率稍低但很实用

| 场景 | 钩子 | 例子 |
| --- | --- | --- |
| 自定义文件类型 | `transform` / `load` | `.md` → Vue 组件、`.graphql` → 文档、`.csv` → 数据模块：[最小实现](./custom-files/01-custom-file-types.md) |
| 迁移 webpack 生态 | 兼容 Rollup 钩子 | 老项目插件平移、内部工具链统一：[最小实现](./migration/01-legacy-rollup.md) |

## 写插件前先问三个问题

1. **配置能解决吗？** 能就别写——`define`、`alias`、`server.proxy` 覆盖了大量需求。
2. **有现成 unplugin 吗？** `unplugin-*` 生态基本覆盖通用场景。
3. **是团队反复手写的东西吗？** 只有「每次都靠人肉同步」的环节，才值得做成插件。

反过来说，**为了一个一次性需求写插件是典型的过度工程**——插件是长期资产，要维护、要跟进 Vite 大版本升级。

---

插件怎么写见 [ch10 插件机制](../guide/ch10-plugins.md)，该装哪些插件见 [附录：开发必备插件清单](./appendix-plugins.md)。
