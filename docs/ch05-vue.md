# ch05 框架加入：Vue + TypeScript（预计 80 分钟）

## 本章目标

1. 理解「框架支持 = 一个 Vite 插件」，并知道 `@vitejs/plugin-vue` 做了什么。
2. 完成从纯 JS 到 Vue 3 + TS 的迁移（配置、入口、目录）。
3. 把 `resolve.alias` 与 `tsconfig.paths` 对齐，消除编辑器报错。
4. 知道 Vite 只转译、不做类型检查，以及这一点带来的影响。

## 前置

完成 ch03（alias）与 ch04（env）。

## 一、为什么框架只是「一个插件」

Vite 核心只认识 JS / TS / CSS / 静态资源。识别 `.vue`、把 `<template>` 编译成渲染函数，是插件的工作：

```text
浏览器请求 App.vue
      ↓
@vitejs/plugin-vue 拦截（load/transform 钩子）
      ↓
@vue/compiler-sfc 把 SFC 拆成 script / template / style
      ↓
script → TS 转译；template → render 函数；style → 独立的 CSS 请求
```

所以：

- 不装 `@vitejs/plugin-vue`，`import App from './App.vue'` 会直接报「无法解析」。
- 换成 React 就是 `@vitejs/plugin-react`，机制完全一样（ch10 会亲手写插件，把这一层彻底打开）。

## 二、本章的迁移清单

| 变更 | 说明 |
| --- | --- |
| `vite.config.js` → `vite.config.ts` | Vite 原生支持 TS 配置，无需编译 |
| 注册 `vue()` | `plugins: [vue()]` |
| `src/main.js` → `src/main.ts` | `createApp(App).use(router).mount('#app')` |
| 新增 `src/App.vue` | 布局 + 导航 + `RouterView` |
| 新增 `src/router/index.ts` | `createWebHistory(import.meta.env.BASE_URL)` |
| 新增 `src/views/*.vue` | Home / About / NotFound |
| `src/utils/math.js` → `math.ts` | 跟随 TS 迁移 |
| 新增 `tsconfig.json` | 含 `paths: { "@/*": ["src/*"] }` |
| `index.html` 入口 | `/src/main.js` → `/src/main.ts` |

## 三、别名要配两遍

```json
// tsconfig.json
"baseUrl": ".",
"paths": { "@/*": ["src/*"] }
```

- `vite.config.ts` 的 `resolve.alias` 负责**运行时/构建时解析**。
- `tsconfig.json` 的 `paths` 负责**编辑器与类型检查解析**。

只配一个的典型症状：页面能跑，但编辑器把 `@/views/Home.vue` 标红；或者反过来。两处保持一致即可。

## 四、Vite 不做类型检查

Vite 用 Oxc 转译 TS，**只去掉类型、不做检查**。这意味着：

- 类型错误不会阻止 `pnpm dev` / `pnpm build`。
- 需要类型检查时，Vue 项目用 `vue-tsc --noEmit`，纯 TS 项目用 `tsc --noEmit`。
- 很多团队把类型检查放进 CI 或 pre-commit，而不是构建流程。

本实验室不引入 `vue-tsc`，避免干扰学习目标；但你至少要知道它存在。

## 五、SPA history 路由的两个前提

1. `createWebHistory(import.meta.env.BASE_URL)`：base 变了路由前缀自动跟随。
2. 部署时服务器要把未命中的路径回退到 `index.html`（Nginx `try_files $uri /index.html;`）。
   否则用户刷新 `/about` 会 404——本地 `vite dev` 帮你做了 fallback，所以这个问题只在部署后暴露。

## 六、动手步骤

1. 启动开发服务器：

   ```bash
   pnpm dev
   ```

2. 页面应显示顶部导航（Home / About）与 Home 的两个面板。

3. 点击 About，再点浏览器**后退**，确认 history 路由工作正常。

4. 在 Home.vue 里把 `add(2, 3)` 改成 `add(2, '3')`，观察：终端与浏览器都**不会**报类型错误（因为不检查），但页面上会得到 `23`。

   然后改回来。这一步是理解「转译 ≠ 类型检查」最快的方式。

5. 打开一个 `.vue` 文件，修改 `<h1>` 文案并保存：页面局部更新，导航状态与页面状态都保留。

6. 生产构建：

   ```bash
   pnpm build
   ```

   产物中应出现独立的 `.css` 文件（SFC 的 `<style scoped>` 被抽取）。

## 观察点

- Network 里 `.vue` 请求返回的是 JS（编译后的 render 函数）。
- `dist/assets/*.css` 存在，说明样式被抽取而不是内联进 JS。
- 改 `vite.config.ts` 依然要重启（配置不热更新）。

## 检查点

```bash
pnpm build
ls dist/assets
```

- [ ] `/` 与 `/about` 都能正常访问
- [ ] 刷新 `/about` 不 404（dev 下）
- [ ] 产物含 `.css` 文件
- [ ] 编辑器里 `@/` 不再报红（需要 TS 服务正常加载 tsconfig）

## 常见坑

- **模板里直接写 `import.meta.env.X`** → 构建报 `import.meta may appear only with 'sourceType: "module"'`。必须在 `<script setup>` 里先取出来再用于模板。
- **只配 alias 没配 `tsconfig.paths`** → 编辑器报红。
- **以为构建会做类型检查** → 类型错误会一路进到产物。
- **history 路由部署后刷新 404** → 服务器缺少 fallback 配置。
- **`vite.config.js` 和 `vite.config.ts` 同时存在** → Vite 只会选一个，很容易改错文件。迁移时要删旧的。

## 进阶（可跳过）

- 阅读 `@vitejs/plugin-vue` 源码里的 `transformMain`，看 SFC 如何被拆成多次请求。
- 试试 `vue-tsc --noEmit`，对比「有类型检查」和「没有」的体验差异。

## 对照答案

```bash
git diff ch04 ch05
```
