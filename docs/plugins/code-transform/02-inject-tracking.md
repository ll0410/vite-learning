# 06 组件挂载点埋点自动注入

> 对应源码：`plugins/code-transform/inject-tracking.ts` 与 `src/plugin-lab/tracking.ts`。

## 真实场景

多个页面都需要在挂载时上报 `page_view` 一类事件。手写 `onMounted` 容易遗漏，也会让业务组件混入重复的横切逻辑。本例只对一个带显式标记的教学 SFC 自动注入一次挂载埋点，页面直接展示本地事件记录，不请求任何外部监控服务。

## 核心钩子与数据流

1. `enforce: 'pre'` 让转换发生在 `@vitejs/plugin-vue` 编译 SFC 之前。
2. `transform` 同时检查目标绝对路径的 `/src/...` 结尾和 `<!-- lab:inject-tracking -->` 标记；其他组件直接返回。
3. 找到 `<script setup>` 开始标签后，注入两条别名导入和一段挂载回调。
4. Vue 编译注入后的 SFC；组件挂载时执行 `__labTrack('code-transform-demo-mounted')`。
5. `tracking.ts` 用响应式数组保存事件，`CodeTransformDemos.vue` 只读取 `trackingEvents` 展示结果。

注入的关键代码如下，组件自身没有手写 `onMounted` 或 `track(...)` 调用：

```ts
import { onMounted as __labOnMounted } from 'vue'
import { track as __labTrack } from '@/plugin-lab/tracking'

__labOnMounted(() => {
  __labTrack('code-transform-demo-mounted')
})
```

`__labOnMounted` 和 `__labTrack` 都使用教学专用别名，避免覆盖组件已有的 `onMounted`、`track` 或其他同名导入。

## 配置接入

在 `plugins/code-transform/index.ts` 中把插件放在分类数组内：

```ts
import { injectTrackingPlugin } from './inject-tracking.ts'

export function codeTransformPlugins(): Plugin[] {
  return [stripDebugPlugin(), injectTrackingPlugin()]
}
```

配置相关导入显式使用 `.ts`。目标 SFC 根级保留 `<!-- lab:inject-tracking -->`，删除该标记即可退出注入，无需修改共享配置。

## 验证步骤

### 1. dev 页面与 Inspect

```bash
pnpm exec vite --port 5212
```

打开 <http://localhost:5212/plugins/code-transform> 的“组件挂载点埋点自动注入”面板：进入页面后应自动出现一条 `code-transform-demo-mounted`，并显示本地记录时间。离开再进入该路由会再次挂载并新增记录。

也可以在另一个终端直接断言转换后的 SFC：

```bash
node --input-type=module -e "const source = await (await fetch('http://localhost:5212/src/views/plugins/categories/CodeTransformDemos.vue')).text(); for (const token of ['__labOnMounted', '__labTrack', 'code-transform-demo-mounted']) { if (!source.includes(token)) throw new Error('缺少 ' + token); } console.log('注入转换断言通过');"
```

在 <http://localhost:5212/__inspect/> 搜索 `CodeTransformDemos.vue`，`lab:inject-tracking` 的 TRANSFORM 结果应位于 Vue 编译之前，并能看到上述别名导入。

### 2. 生产构建

```bash
pnpm build
node --input-type=module -e "import { readdirSync, readFileSync } from 'node:fs'; const file = readdirSync('dist/assets').find((name) => /^CodeTransformDemos-.*\\.js$/.test(name)); if (!file) throw new Error('缺少分类 chunk'); const output = readFileSync('dist/assets/' + file, 'utf8'); if (!output.includes('code-transform-demo-mounted')) throw new Error('生产构建丢失埋点'); console.log('生产埋点断言通过');"
```

再运行 `pnpm docs:build` 和 `git diff --check`。

## 生产级实现还需补齐

- 使用 Vue SFC parser 精确区分 script/template/custom blocks，再用 AST 修改导入和语句，并生成 sourcemap。
- 根据路由参数生成事件属性，处理去重、批量发送、失败重试、隐私脱敏和用户授权；本地数组只是可观察的教学替身。
- 明确 HMR/重复挂载的事件语义，避免开发热更新或重复注入造成误导。
- 通过配置维护目标清单或统一约定，而不是把单个组件路径硬编码为通用规则。

## 常见坑

- **普通插件顺序拿不到原始 SFC**：目标转换需要在 Vue 编译前执行，因此使用 `enforce: 'pre'`。
- **把绝对 id 与 `/src/...` 直接判等**：真实 id 带仓库前缀，应使用受控路径结尾匹配；只按路径匹配又会让所有组件都被注入，因此本例还要求显式标记。
- **导入同名标识符**：可能与已有代码冲突，所以两个导入都别名化。
- **把页面展示当成真实上报**：本例没有网络请求；生产监控需要独立、可靠的传输与合规策略。
