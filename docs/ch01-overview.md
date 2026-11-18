# ch01 Vite 概述（预计 40 分钟）

## 本章目标

跑完本章你应该能：

1. 用一句话说清 Vite 的 dev server 与生产构建分别是怎样工作的。
2. 解释「为什么 dev 不打包，但 build 仍然要打包」。
3. 说出 Vite 8 相比 Vite 4/5 教程里描述的技术栈差异（Rolldown / Oxc / Lightning CSS）。
4. 在 DevTools Network 面板里直接观察到「按需编译」的证据。

## 前置

无。只需要 Node ≥ 22.12 和 pnpm。

## 一、Vite 的定位

Vite 由两部分组成：

- **开发服务器（dev）**：利用浏览器原生 ESM，按需编译、按需返回模块，不做整包构建。
- **构建工具（build）**：调用 Rolldown 把源码打包成生产产物，同时完成压缩、代码分割、资源处理。

这两条链路用的是同一套插件与配置，但执行方式完全不同。**把这两条链路分清楚，是学好 Vite 的分水岭。**

## 二、没有 Vite 之前：bundler-based dev server 的瓶颈

Webpack / Rollup 时代的开发流程是：

```text
启动 dev server → 把整个应用（含所有依赖）打包成 bundle → 交给浏览器
改了 1 个文件 → 重新计算受影响的模块 → 重新打包 → 通过 HMR 推送
```

应用越大，两个成本越高：

1. **冷启动**：必须先把所有模块解析、转译、打包完才能打开页面。
2. **更新延迟**：一次改动可能触发大范围重新打包，HMR 更新越来越慢。

根本原因是：**开发阶段做的事情和生产阶段一样多，只是把产物放在了内存里。**

## 三、dev 链路：按需编译 + 原生 ESM

Vite 的做法是「把打包这件事推迟」：

```text
浏览器请求 /index.html
        ↓
Vite 中间件拦截请求
        ↓
只对「当前这个请求的模块」做转译（TS/JSX/Vue/Sass…）
        ↓
以 ESM 形式返回，浏览器自己顺着 import 继续请求
```

关键点：

- 浏览器原生支持 `import`，所以不需要提前把所有模块合成一个文件。
- 依赖（`node_modules`）用 **依赖预构建** 提前处理一次，业务代码则始终按需转译。
- 因此冷启动时间基本与应用体积无关，只与「首屏请求了多少模块」有关。
- 修改文件时，只需要让浏览器重新请求那一个模块（HMR 在此基础上再做状态保留）。

一句话记忆：**dev 阶段没有 bundle，只有「一个会转译源码的静态文件服务器 + 模块图」。**

## 四、build 链路：Rolldown + Oxc + Lightning CSS

生产环境仍然需要打包，Vite 的构建流程是：

```text
源码 → Rolldown（打包/代码分割/摇树） → Oxc（JS 转译与压缩） → Lightning CSS（CSS 压缩） → dist/
```

Vite 8 的技术栈替换（重要，很多旧教程还停留在 esbuild + Rollup）：

| 环节 | Vite ≤7 | Vite 8 |
| --- | --- | --- |
| 打包 | Rollup | **Rolldown** |
| JS 转译 | esbuild | **Oxc** |
| JS 压缩 | esbuild | **Oxc** |
| CSS 压缩 | esbuild | **Lightning CSS**（`build.cssMinify` 默认 `lightningcss`） |
| 依赖预构建 | esbuild | **Rolldown** |

细节见 [appendix-vite8-changes.md](./appendix-vite8-changes.md)。

## 五、为什么生产环境还要打包

常见的疑问是：「dev 都不打包了，build 为什么不也直接发源码？」

1. **请求数量**：一个中型应用按模块拆开会有几百上千个请求，即使 HTTP/2 也有连接与调度成本。
2. **压缩效率**：多个模块合并后，gzip/brotli 的字典复用率更高，总传输体积更小。
3. **缓存粒度**：把不常变的依赖抽成 vendor chunk，可以长期命中浏览器缓存。
4. **兼容性降级**：需要把 TS、新语法、CSS 新特性降级到目标浏览器。
5. **摇树与常量折叠**：生产环境需要移除死代码、dev-only 分支。

## 六、Vite 与 Webpack 的心智模型对比

| 维度 | Webpack | Vite |
| --- | --- | --- |
| dev 启动 | 先打包再服务，随体积线性变慢 | 按需编译，基本恒定 |
| HMR 粒度 | 模块图 + 重新打包 | 单模块更新，依赖原生 ESM |
| 配置心智 | loader + plugin 两套体系 | 一套插件体系（兼容 Rollup/Rolldown 钩子） |
| 生产构建 | 自身生态 | Rolldown（Vite 8） |
| 框架支持 | 社区 loader | 官方 `@vitejs/plugin-vue` / `@vitejs/plugin-react` |
| 适用场景 | 存量项目、复杂定制 | 新项目、现代浏览器优先 |

## 七、动手：观察官方模板（10 分钟）

在**临时目录**做，不要污染本仓库：

```bash
cd /tmp
pnpm create vite@latest vite-official-demo --template vue-ts
cd vite-official-demo
pnpm install
pnpm dev
```

然后：

1. 打开 `http://localhost:5173`。
2. DevTools → Network，勾选 `Disable cache`，刷新。
3. 观察请求列表：你会看到 `index.html`、`/src/main.ts`、`/src/App.vue`、`node_modules/.vite/deps/vue.js` 等一条条 ESM 请求。
4. 点开 `/src/App.vue` 的响应体：里面是被编译后的 JS，`<template>` 已经变成渲染函数。
5. 再执行 `pnpm build`，观察 `dist/assets` 里的产物：这里才是「打包后的世界」。

## 观察点

- 终端里首次启动会打印 `VITE v8.x  ready in xxx ms`。
- Network 面板中 `node_modules/.vite/deps/` → 依赖预构建产物（ch06 详解）。
- `dist/assets/*.js` 与 `dist/assets/*.css` → 构建产物（ch11/ch12 详解）。

## 检查点

自测（能答 10 条以上再进入下一章）：

1. dev 阶段 Vite 会把整个应用打包吗？
2. 浏览器在 dev 阶段请求 `/src/App.vue` 时拿到的是什么？
3. 依赖预构建解决的是哪三个问题？
4. Vite 8 用什么替代了 Rollup？用什么替代了 esbuild？
5. CSS 压缩默认用的是什么工具？
6. 为什么生产环境不直接发 ESM 源码？
7. HMR 为什么比 Webpack 时代更快？
8. `vite` 命令与 `vite build` 命令分别对应哪条链路？
9. `dist/` 目录是谁生成的？
10. Vite 的插件体系来自哪两个生态的兼容？
11. `build.rollupOptions` 在 Vite 8 里是什么地位？
12. 为什么说「Vite 快」主要快在 dev，而不是 build？

## 常见误解

- **「Vite 不用打包」**：只在 dev 成立，build 依然打包。
- **「Vite 生产构建一定比 Webpack 快很多」**：构建速度取决于项目与 Rolldown 的成熟度，不要把它当结论。
- **「Vite 只支持 Vue」**：插件机制与框架无关，官方提供 Vue / React / Svelte / Solid 等模板。
- **「dev 里看到的文件结构就是产物结构」**：完全不是，产物由构建器重新组织。

## 进阶（可跳过）

- 阅读 Vite 官方 Why Vite：<https://vite.dev/guide/why>
- 在 Network 面板里对比「首屏请求数」与「`pnpm build` 后的文件数」，自己算一下合并收益。

## 下一章

[ch02 快速开始](./ch02-quick-start.md)：不用脚手架，从零手写一个最小 Vite 项目。
