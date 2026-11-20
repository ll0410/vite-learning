# 学习路线速查表

按顺序做，每章都有可执行的验证命令。详细步骤见各章文档。

## 总览

| # | 章节 | 核心问题 | 预计 | 验证命令 |
| --- | --- | --- | --- | --- |
| 01 | [概述](./ch01-overview.md) | dev 与 build 到底差在哪？ | 40m | 能答出文档末尾 12 道自测题 |
| 02 | [快速开始](./ch02-quick-start.md) | 最小项目需要几个文件？ | 40m | `pnpm dev` / `pnpm build` / `pnpm preview` |
| 03 | [默认配置](./ch03-config-basics.md) | 哪些配置每天都会碰？ | 60m | `pnpm build --base=/app/` |
| 04 | [环境变量](./ch04-env.md) | 怎么安全地分环境？ | 60m | `pnpm build:staging` + `grep DB_PASSWORD dist` |
| 05 | [框架加入](./ch05-vue.md) | 框架支持到底是什么？ | 80m | `pnpm build` 产物含 CSS |
| 06 | [依赖预构建](./ch06-dep-prebundle.md) | 为什么 node_modules 要单独处理？ | 60m | `ls node_modules/.vite/deps` |
| 07 | [CSS 工程化](./ch07-css.md) | 样式怎么写才可维护？ | 70m | 产物 CSS 含 `-webkit-user-select` |
| 08 | [静态资源](./ch08-assets.md) | 图片该放 public 还是 assets？ | 50m | `find dist -name small.png` 为空 |
| 09 | [HMR](./ch09-hmr.md) | 为什么有时热更新、有时整页刷新？ | 60m | 改模板后计数保留 |
| 10 | [插件机制](./ch10-plugins.md) | 插件如何介入编译流程？ | 70m | `/__inspect/` 可访问 |
| 11 | [代码分割](./ch11-code-splitting.md) | 首屏为什么能变小？ | 50m | `ls dist/assets/vendor-*` |
| 12 | [性能优化](./ch12-performance.md) | 优化的抓手有哪些？ | 60m | `pnpm build:analyze` 生成 stats.html |

## 附录

- [Vite 8 的关键变化](./appendix-vite8-changes.md)：技术栈替换与配置项映射。
- [插件的高频使用场景](./appendix-plugin-scenarios.md)：六类自研场景与选型判断。
- [开发必备插件清单](./appendix-plugins.md)：按必装 / 推荐 / 按需分档。

## 每章的固定结构

1. **本章目标**：3–4 条可验证的目标。
2. **前置**：需要先完成哪一章。
3. **动手步骤**：编号命令，直接复制即可。
4. **观察点**：终端日志 / DevTools 面板 / dist 文件里该看什么。
5. **检查点**：自测问题 + 可执行断言。
6. **常见坑**：本章实际会踩的坑。
7. **进阶**：标注「可跳过」。
8. **对照答案**：`git diff chXX-1 chXX`。

## 标签对照

| tag | 内容 |
| --- | --- |
| `ch00` | 脚手架（package.json / lockfile / 忽略文件） |
| `ch01` | 概述与 Vite 8 变化附录 |
| `ch02` | 最小 JS 项目 |
| `ch03` | alias / server / build 配置 |
| `ch04` | 环境变量 |
| `ch05` | Vue + TS 迁移 |
| `ch06` | 依赖预构建 |
| `ch07` | SCSS / CSS Modules / PostCSS |
| `ch08` | 静态资源 |
| `ch09` | HMR |
| `ch10` | 自定义插件 |
| `ch11` | 代码分割 |
| `ch12` | 性能优化 |

## 一天结束时的验收

```bash
pnpm install
pnpm build
pnpm build:staging
pnpm build:analyze
git tag -l
```

应当满足：

- `dist/assets` 里有 `vendor-vue-*`、`vendor-utils-*`、`Dashboard-*`、`format-*`。
- `dist` 中没有 `small.png`，有 `big.png`。
- `grep -r "DB_PASSWORD" dist` 无结果。
- 产物 JS 中 `console.debug` 数量为 0。
- `dist/index.html` 含 `build-stamp`。
- 存在 `.gz` 与 `.br` 文件。
