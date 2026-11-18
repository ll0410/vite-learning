# Vite 一天动手实验室

一个「边做边学」的 Vite 学习仓库：单项目渐进式演进，每章一次提交 + 一个 git tag，配套中文实验文档。

- 目标：**一天之内**把 Vite 的开发链路、构建链路、插件机制与性能优化跑通一遍。
- 方式：12 个可运行章节，每章都有明确的动手步骤、观察点和检查命令。
- 版本：**Vite 8.3.8** + Vue 3.5 + TypeScript（Vite 8 已用 Rolldown / Oxc / Lightning CSS 替换旧技术栈，见 [附录](./docs/appendix-vite8-changes.md)）。

## 需要什么

| 项 | 要求 |
| --- | --- |
| Node | `^20.19.0` 或 `>=22.12.0` |
| 包管理器 | pnpm（仓库使用 pnpm 10） |
| 基础 | 会写 Vue 3 与 TypeScript；了解 ESM 的 `import` 即可 |

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:5173>，看到实验室首页就说明环境正常。

## 12 小时时间表

| 时段 | 内容 | 时长 |
| --- | --- | --- |
| 09:00–09:40 | [ch01 概述与心智模型](./docs/ch01-overview.md) | 40m |
| 09:40–10:20 | [ch02 快速开始](./docs/ch02-quick-start.md) | 40m |
| 10:20–10:30 | 休息 | 10m |
| 10:30–11:30 | [ch03 默认配置与常识](./docs/ch03-config-basics.md) | 60m |
| 11:30–12:30 | [ch04 环境变量](./docs/ch04-env.md) | 60m |
| 12:30–13:30 | 午餐 | 60m |
| 13:30–14:50 | [ch05 框架加入（Vue）](./docs/ch05-vue.md) | 80m |
| 14:50–15:50 | [ch06 依赖预构建](./docs/ch06-dep-prebundle.md) | 60m |
| 15:50–16:00 | 休息 | 10m |
| 16:00–17:10 | [ch07 CSS 工程化](./docs/ch07-css.md) | 70m |
| 17:10–18:00 | [ch08 静态资源](./docs/ch08-assets.md) | 50m |
| 18:00–18:40 | 晚餐 | 40m |
| 18:40–19:40 | [ch09 HMR](./docs/ch09-hmr.md) | 60m |
| 19:40–20:50 | [ch10 插件机制](./docs/ch10-plugins.md) | 70m |
| 20:50–21:40 | [ch11 代码分割](./docs/ch11-code-splitting.md) | 50m |
| 21:40–22:40 | [ch12 性能优化](./docs/ch12-performance.md) | 60m |
| 22:40–23:00 | 复盘与自测 | 20m |

纯学习时间 720 分钟。目录级速查见 [docs/00-roadmap.md](./docs/00-roadmap.md)。

### 只有 10 小时？跳过这些

- ch01 的官方模板对照实验（-10m）
- ch03 的多页应用说明（-10m）
- ch07 的 `css.lightningcss` 深入（-10m）
- ch08 的 `new URL` / `assetsInclude`（-10m）
- ch10 的第 4 个插件与 `/__inspect/` 深入（-20m）
- ch12 的 Lighthouse 实测（-20m）

## 怎么练

**推荐流程（先自己写，再对答案）：**

1. 进入某一章文档，先不要看「对照答案」。
2. 按「动手步骤」自己改代码，遇到问题查「常见坑」。
3. 跑「检查点」里的命令确认结果。
4. 卡住了再对照参考实现：

   ```bash
   git diff ch05 ch06        # 看 ch06 相比 ch05 改了什么
   ```

**想把自己的练习和参考实现分开：**

```bash
git switch -c lab           # 在 lab 分支上随便改
git checkout ch05 -- .      # 把工作区重置回某一章的参考实现（会覆盖改动）
```

> `git checkout <tag> -- .` 会丢弃当前改动，请先确认没有想保留的内容。

## 章节与主题对照

| 章节 | 对应主题 | 关键产出 |
| --- | --- | --- |
| ch01 | Vite 概述 | 心智模型、Vite 8 变化清单 |
| ch02 | 快速开始 | 最小可运行项目、dev/build/preview |
| ch03 | 默认配置与常识 | alias、server、base、多页、常见坑 |
| ch04 | 环境变量 | `.env.*`、`VITE_` 前缀、`loadEnv` |
| ch05 | 框架加入（Vue） | `@vitejs/plugin-vue`、SFC、TS、路由 |
| ch06 | 依赖预构建 | `.vite/deps`、`optimizeDeps`、`--force` |
| ch07 | CSS 工程化 | SCSS、CSS Modules、PostCSS、Lightning CSS |
| ch08 | 静态资源处理 | `public` vs `assets`、`?url/?raw/?inline` |
| ch09 | HMR | `import.meta.hot`、更新边界、状态保留 |
| ch10 | 插件机制 | 四个自写插件 + `/__inspect/` |
| ch11 | Code Splitting | 路由懒加载、`codeSplitting.groups`、vendor |
| ch12 | 性能优化 | `warmup`、产物分析、gzip/brotli、检查清单 |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器（`http://localhost:5173`） |
| `pnpm dev:force` | 强制重新预构建依赖 |
| `pnpm build` | 生产构建到 `dist/` |
| `pnpm build:staging` | 用 `staging` 模式构建（验证环境变量） |
| `pnpm build:analyze` | 构建并生成 `dist/stats.html` 产物分析 |
| `pnpm preview` | 本地预览 `dist/` 产物（`http://localhost:4173`） |

## 这个仓库里有什么「不是默认」的东西

这些都是教学用的刻意设计，不要当成最佳实践直接照搬：

- `.env` 里有一个假的 `DB_PASSWORD`，用来演示「非 `VITE_` 变量不会进客户端」。
- `plugins/strip-debug.ts` 用正则删除 `console.debug`，仅用于演示 `transform` 钩子；真实项目请用 AST。
- `src/assets/big.png` 是脚本生成的噪点图（约 187KB），用来验证内联阈值。
- `dist/stats.html` 是构建产物，不提交到 git。

## 学完之后

- 把 `plugins/` 里的插件改成 AST 版本，并加上 sourcemap。
- 引入 `vue-tsc`，把类型检查放进 CI。
- 给项目加上 ESLint / Prettier / Vitest。
- 阅读 [Vite 官方文档](https://vite.dev/) 与 [Rolldown 文档](https://rolldown.rs/)。
