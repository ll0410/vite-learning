# ch09 HMR 模块热替换（预计 60 分钟）

## 本章目标

1. 理解 HMR 的「更新边界」概念，能解释什么时候局部更新、什么时候整页刷新。
2. 会用 `import.meta.hot.accept` / `dispose` / `data` 保存模块状态。
3. 知道 Vue SFC 的 HMR 是插件注入的运行时能力。
4. 能区分 `invalidate` 与「更新冒泡」的区别。

## 前置

完成 ch05（Vue）与 ch08。

## 一、HMR 不是「自动魔法」

Vite 的 HMR 链路：

```text
文件变化 → 服务端算出受影响的模块 → WebSocket 推送 update
        → 浏览器里的 HMR runtime 找到「接受者」并替换模块
        → 找不到接受者 → 一路冒泡到入口 → 整页刷新
```

**接受者（accepting module）** 是关键词。一个模块只有显式声明：

```ts
import.meta.hot.accept()
```

才会成为更新边界。否则它的更新会传给它的 importers，一直向上，最终刷新整页。

## 二、Vue 组件为什么能保留状态

`@vitejs/plugin-vue` 会给每个 SFC 注入类似这样的代码：

```ts
if (import.meta.hot) {
  import.meta.hot.accept()
  // 内部通过 __VUE_HMR_RUNTIME__ 重新渲染组件，而不销毁实例
}
```

所以修改 `<template>` 时，组件实例（`ref`、`reactive` 的状态）被保留，只替换渲染函数。

而普通 `.ts` 模块没有这层注入，必须自己写。

## 三、本章的两个演示

### 1. 自接受模块：`src/hmr-demo/counter.ts`

```ts
const previous = import.meta.hot?.data as { state?: CounterState } | undefined
const state = previous?.state ?? { count: 0 }

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // 用新模块的函数重新绑定同一个 DOM 节点
    newModule?.mountCounter(el!)
  })
  import.meta.hot.dispose((data) => {
    data.state = state   // 把状态交给下一版
  })
}
```

三个 API 的分工：

| API | 作用 |
| --- | --- |
| `accept()` | 声明自己是更新边界 |
| `dispose(cb)` | 模块被替换前执行，用来清理副作用、交出状态 |
| `data` | 跨版本传递数据的容器（`dispose` 写入，新模块读取） |

### 2. 无接受者模块：`src/hmr-demo/no-accept.ts`

它被入口 `main.ts` 直接 import，自己也没有 `accept`。修改它 → 更新冒泡到入口 → **整页刷新**。

这就是判断「为什么我改这个文件页面刷了」的标准方法：看更新传到了谁。

## 四、动手步骤

1. 启动 dev：

   ```bash
   pnpm dev
   ```

2. 首页找到「HMR 状态保留」面板。

3. 点几下「手写 HMR 计数器」，再点几下「Vue 组件内计数」。此时两个数值都不为 0。

4. 修改 `src/components/Counter.vue` 的模板（比如把「Vue 组件内计数」改成「Vue 局部状态」），保存。

   预期：页面**不刷新**，两个数值**都保留**。

5. 修改 `src/hmr-demo/counter.ts` 里的文案（例如把提示语改一句），保存。

   预期：页面不刷新，手写计数器的数值保留，Console 打印 `[hmr] counter.ts 已自我更新`。

6. 修改 `src/hmr-demo/no-accept.ts` 的文案，保存。

   预期：**整页刷新**，所有计数归零。Network 里能看到文档请求。

7. 打开 Console，观察 `[hmr] beforeUpdate` 打印了哪些路径——这是更新边界的第一手证据。

8. （可选）在 `counter.ts` 里调用 `import.meta.hot.invalidate()`，观察行为：当前模块放弃自我接受，强制向上传播。

## 观察点

- 终端会打印 `hmr update /src/components/Counter.vue` 之类的日志。
- 整页刷新时，浏览器标签会转圈，Console 被清空（取决于 DevTools 设置）。
- HMR 更新只发送变化的模块，不会重新请求整个应用。

## 检查点

- [ ] 改 Vue 模板，计数保留
- [ ] 改 `counter.ts`，计数保留且 Console 有自我更新日志
- [ ] 改 `no-accept.ts`，整页刷新
- [ ] 能解释「更新冒泡」的方向（module → importer → … → entry）

## 常见坑

- **`addEventListener` 没有在 `dispose` 里移除** → 热更新多次后一次点击触发多次。
- **`accept` 回调里重新 new 了一个实例** → 旧实例的定时器/监听器泄漏。
- **用 `import.meta.hot.data` 存复杂对象** → 它只在同一模块的更新之间传递，不能持久化到刷新之后。
- **以为所有文件都能热更新** → 入口、`index.html`、`vite.config` 的改动都会导致重启/刷新。
- **改了 `vite.config` 的 `server.hmr` 但没生效** → 配置改动必须重启。
- **生产环境访问 `import.meta.hot`** → 构建时它会被替换为 `undefined`，所以必须用 `if (import.meta.hot)` 包裹。

## 进阶（可跳过）

- 阅读 Vue 的 `__VUE_HMR_RUNTIME__`（`@vue/runtime-core` 的 `hmr.ts`）。
- `server.hmr.overlay`：运行时错误遮罩的开关与样式。
- 阅读：<https://vite.dev/guide/api-hmr>

## 对照答案

```bash
git diff ch08 ch09
```
