# 06 组件挂载点埋点自动注入

> 对应源码：`plugins/code-transform/inject-tracking.ts`、`src/plugin-lab/tracking.ts` 与 `src/views/plugins/categories/CodeTransformDemos.vue`。

多个页面都需要在挂载时上报 `page_view` 一类事件时，手写 `onMounted` 容易遗漏，也会让业务组件混入重复的横切逻辑。本例让 Vite 插件在 Vue 编译前，向一个**路径固定且带显式标记**的教学组件注入挂载回调；页面直接展示本地事件记录，不请求任何外部监控服务。

## 核心示例：一条挂载记录怎样出现

这里的 SFC 指 Vue 单文件组件（Single-File Component），也就是包含 `<script>`、`<template>` 等块的 `.vue` 文件。`transform` 则是 Vite 的转换钩子：插件在这里收到模块源码 `code` 和模块标识 `id`，可以返回修改后的源码。

先看完整数据流，再逐项拆解：

```text
带标记的 CodeTransformDemos.vue
        ↓ lab:inject-tracking 的 transform
仍是 SFC，但 <script setup> 中多了 import 和 onMounted 回调
        ↓ @vitejs/plugin-vue 编译
浏览器可执行的组件 JavaScript
        ↓ 路由组件挂载
track('code-transform-demo-mounted') 写入本地响应式数组
        ↓ 模板读取 trackingEvents
页面显示事件数量、事件名和 ISO 时间
```

### 1. 输入：带标记、但没有手写埋点的组件

受控输入是 `src/views/plugins/categories/CodeTransformDemos.vue`。下面只摘录与本例有关的代码，省略同页其他示例的 fixture import、租户配置和模板内容：

```vue
<!-- lab:inject-tracking -->
<script setup lang="ts">
import { trackingEvents } from '@/plugin-lab/tracking'
</script>
```

原始 `<script setup>` 中没有 `onMounted`，也没有调用 `track(...)`。文件第一行的注释是插件约定的显式开关；除此之外，插件还要求模块路径以 `/src/views/plugins/categories/CodeTransformDemos.vue` 结尾，并且源码中存在 `<script setup>` 开始标签。

### 2. 转换结果：在开始标签后插入挂载回调

插件构造的 `injection` 完整如下，其中 `${scriptSetup}` 是刚匹配到的原开始标签；第一条新增导入来自 Vue，第二条来自本地事件模块：

```ts
const injection = `${scriptSetup}
import { onMounted as __labOnMounted } from 'vue'
import { track as __labTrack } from '@/plugin-lab/tracking'
__labOnMounted(() => {
  __labTrack('code-transform-demo-mounted')
})`
```

注入发生在 `<script setup lang="ts">` 之后，原有 import、租户配置和其他代码仍保留在后面。因此，插件刚返回时得到的仍是 SFC 文本，而不是已经编译好的 JavaScript。

`onMounted` 是 Vue 的生命周期钩子，会在组件挂载完成后执行回调。两个导入使用教学专用别名，是为了避开组件可能已有的 `onMounted`、`track` 等同名标识符；别名本身并不代表已经具备通用冲突检测。

### 3. 消费者：本地事件模块与组件模板

注入代码调用的 `track` 来自 `src/plugin-lab/tracking.ts`。该文件完整实现如下：

```ts
import { readonly, ref } from 'vue'

export interface TrackingEvent {
  name: string
  occurredAt: string
}

const events = ref<TrackingEvent[]>([])

export const trackingEvents = readonly(events)

export function track(name: string) {
  events.value.push({ name, occurredAt: new Date().toISOString() })
}
```

`ref` 保存响应式数组，`track` 每调用一次就追加事件名和 ISO 格式时间；`readonly` 给页面提供只读视图，避免模板直接改写数组。

目标组件的模板是另一个消费者。以下摘录省略事件面板中的说明文字和指南链接：

```vue
<p class="event-count" data-testid="tracking-count">已记录 {{ trackingEvents.length }} 条挂载事件</p>
<ul v-if="trackingEvents.length" class="events">
  <li v-for="(event, index) in trackingEvents" :key="index" data-testid="tracking-event">
    <code>{{ event.name }}</code>
    <time :datetime="event.occurredAt">{{ event.occurredAt }}</time>
  </li>
</ul>
<p v-else>等待组件挂载…</p>
```

数组更新后，Vue 会重新渲染数量和列表。这里没有网络 SDK，也没有 `fetch` 等上报请求；本地数组只是便于观察的教学替身。

### 4. 页面结果：挂载一次，新增一条记录

`/plugins/code-transform` 路由通过动态 import 加载这个分类页，`App.vue` 使用普通的 `<RouterView />`，没有 `KeepAlive`。因此：

- 在全新页面会话中首次进入分类页，应看到 1 条 `code-transform-demo-mounted` 及其时间。
- 离开该路由再返回，组件会重新挂载，原数组中再追加 1 条记录。
- 手动刷新整个浏览器页面会重新创建 JavaScript 运行环境，本地数组随之清空，再从首次挂载记录开始。

## 实现原理：插件怎样只改目标 SFC

完整实现位于 `plugins/code-transform/inject-tracking.ts`，可以按“限定范围 → 找插入点 → 返回新源码”阅读。

### 1. 同时检查路径、标记和 script setup

```ts
const targetSfc = '/src/views/plugins/categories/CodeTransformDemos.vue'
const trackingMarker = '<!-- lab:inject-tracking -->'
```

`transform(code, id)` 中的范围检查是：

```ts
const cleanId = id.split('?', 1)[0]
if (!cleanId.endsWith(targetSfc) || !code.includes(trackingMarker)) return

const scriptSetup = code.match(/<script\b[^>]*\bsetup\b[^>]*>/)?.[0]
if (!scriptSetup) return
```

每一步都有明确作用：

| 检查或处理 | 作用 |
| --- | --- |
| `id.split('?', 1)[0]` | 去掉 `?vue` 等查询参数，避免查询串干扰路径判断 |
| `cleanId.endsWith(targetSfc)` | 兼容带仓库绝对路径前缀的模块 ID，同时把范围限制在这一个组件 |
| `code.includes(trackingMarker)` | 要求源码显式选择注入，避免仅靠路径约定误改组件 |
| 正则提取 `scriptSetup` | 找到包含 `setup` 的完整 `<script ...>` 开始标签，连同 `lang="ts"` 等属性一起保留 |
| 直接 `return` | 返回 `undefined`，表示这个模块不由本插件修改 |

示例把标记放在文件第一行，便于阅读和维护；当前实现只做字符串包含检查，**并不会校验注释是否位于根级**。没有 `script setup` 的普通 `<script>`、Options API 组件也不会被处理。

### 2. 替换开始标签，而不是重写整个组件

前面看到的 `injection` 以原开始标签开头，后接两条 import 和挂载回调。返回值是：

```ts
return { code: code.replace(scriptSetup, injection), map: null }
```

`code.replace` 只把匹配到的开始标签替换为“开始标签 + 注入内容”，组件其余文本不变。随后 `@vitejs/plugin-vue` 才编译修改后的 SFC。

`map: null` 表示本次字符串插入没有提供 source map（源码映射，即转换前后行列位置的对应关系），并不表示没有返回代码。教学示例可以接受这个简化；如果需要在断点调试时准确定位原始 `.vue` 文件，生产插件应生成并串联源码映射。

### 3. 为什么必须使用 enforce: 'pre'

插件声明了：

```ts
{
  name: 'lab:inject-tracking',
  enforce: 'pre',
  // transform 的实现见前文
}
```

`enforce: 'pre'` 把转换放入前置插件组。这样即使 `vite.config.ts` 的数组里 `vue()` 写在 `...codeTransformPlugins()` 前面，本插件仍能先取得原始 SFC，再由 Vue 官方插件编译。若等 Vue 编译完成后再找 `<script setup>`，面对的已经是 JavaScript 模块，原来的插入点自然不存在。

## 配置接入

`plugins/code-transform/index.ts` 中的分类入口实际注册了四个插件。下面保留完整返回数组；各插件的 import 和注释未摘录：

```ts
export function codeTransformPlugins(): Plugin[] {
  return [stripDebugPlugin(), injectTrackingPlugin(), tenantBuildPlugin(), conditionalBuildPlugin()]
}
```

根目录 `vite.config.ts` 展开这个数组，并注册 Inspect。以下是相关位置的摘录，注释只表示省略其他插件，不是需要新增的配置：

```ts
plugins: [
  vue(),
  // ……代码生成等其他插件
  ...codeTransformPlugins(),
  // ……其余分类插件
  inspect(),
],
```

数组顺序与 `enforce` 要一起理解：同属前置组时，`lab:strip-debug` 位于 `lab:inject-tracking` 前；Vue 的正常 SFC 编译仍在这些前置转换之后。

注入代码中的 `@/plugin-lab/tracking` 依赖项目已有别名：

```ts
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
},
```

无需为本例额外添加模块类型声明：`vue` 提供 `onMounted` 类型，`tracking.ts` 自身导出 `track`、`trackingEvents` 和 `TrackingEvent`。`src/types/code-transform.d.ts` 只声明同页租户示例的全局常量，与埋点注入无关。

要退出某个目标组件的注入，可以删除它的 `<!-- lab:inject-tracking -->` 标记，无需修改共享配置。在当前实现中，把标记加到其他文件也不会生效，因为路径仍被固定为 `CodeTransformDemos.vue`。

## 验证步骤

### 1. 检查页面中的挂载记录

```bash
pnpm exec vite --port 5212
```

端口空闲时，终端应显示 `Local: http://localhost:5212/`。打开 <http://localhost:5212/plugins/code-transform#inject-tracking>，预期看到：

- “已记录 1 条挂载事件”（以全新页面会话首次进入为准）；
- 列表中有 `code-transform-demo-mounted`；
- `<time>` 显示本次挂载产生的 ISO 时间。

离开分类页再返回，数量应增加；刷新整个页面后，本地记录应重新从 1 条开始。这个页面的网络面板可能仍有正常的模块和资源请求，但 `track` 本身不会发出监控上报请求。

### 2. 检查转换后的浏览器模块与中间结果

保持 dev server 运行，在另一个终端执行：

```bash
node --input-type=module -e "const source = await (await fetch('http://localhost:5212/src/views/plugins/categories/CodeTransformDemos.vue')).text(); for (const token of ['__labOnMounted', '__labTrack', 'code-transform-demo-mounted']) { if (!source.includes(token)) throw new Error('缺少 ' + token); } console.log('注入转换断言通过');"
```

预期输出：

```text
注入转换断言通过
```

这里请求到的是 Vue 编译后发送给浏览器的组件 JavaScript，不是插件刚修改完的原始 SFC；其中仍应保留两个别名和事件名。

若要查看 Vue 编译前的中间结果，打开 <http://localhost:5212/__inspect/>，搜索 `CodeTransformDemos.vue`。`lab:inject-tracking` 的 TRANSFORM 记录应包含开始标签后的别名导入和挂载回调，并位于 `vite:vue` 的编译之前。

### 3. 检查生产 chunk 是否保留回调

```bash
pnpm build
node --input-type=module -e "import { readdirSync, readFileSync } from 'node:fs'; const file = readdirSync('dist/assets').find((name) => /^CodeTransformDemos-.*\\.js$/.test(name)); if (!file) throw new Error('缺少分类 chunk'); const output = readFileSync('dist/assets/' + file, 'utf8'); if (!output.includes('code-transform-demo-mounted')) throw new Error('生产构建丢失埋点'); console.log('生产埋点断言通过');"
```

预期在 `dist/assets` 找到文件名形如 `CodeTransformDemos-<hash>.js` 的分类 chunk，并输出：

```text
生产埋点断言通过
```

这个断言证明事件字符串进入了生产分类 chunk，不等于已经验证浏览器中的挂载时序，更不代表发生了真实网络上报。

## 进阶参考

::: details 生产级实现还需补齐

- **用解析器替代正则和字符串猜测。** 先用 Vue SFC parser 区分 script、template 和自定义块，再用 AST（抽象语法树，把源码解析成结构化语法节点）定位导入与语句。当前正则可能误匹配注释或字符串中的相似文本，也不适合任意复杂属性。
- **生成准确的源码映射。** 本例返回 `map: null`；生产实现可使用 MagicString 等工具保留修改并生成 source map，还要验证它与 Vue 后续编译映射的串联。
- **把目标范围做成受控配置。** 当前路径只服务一个教学组件。通用插件应维护目标清单或明确约定，提供冲突诊断，并避免重复注册插件导致重复注入。
- **定义真实事件语义。** 根据路由参数生成事件属性，处理去重、批量发送、失败重试、隐私脱敏和用户授权。组件 `mounted` 不一定等于业务上的一次页面浏览；使用 `KeepAlive` 时还应明确是否监听 `activated`。
- **明确 HMR 与重复挂载策略。** HMR（热模块替换，开发时更新模块）和路由重复进入都可能让开发记录多于直觉预期。生产逻辑需要区分真实浏览、开发更新和重复执行。
- **不要把本地数组当作持久存储。** 它会在整页刷新时丢失，也没有容量限制、持久化或跨标签页同步能力。

:::

::: details 常见坑

- **只看配置数组判断执行顺序**：`vue()` 虽然写在前面，`enforce: 'pre'` 仍让本插件先转换原始 SFC。
- **把绝对模块 ID 与 `/src/...` 直接判等**：真实 ID 带仓库前缀，还可能有查询参数；应先清理查询串，再做受控结尾匹配。
- **删除标记后仍期待注入**：路径、标记、`script setup` 任一条件不满足都会返回 `undefined`，模块保持原样。
- **以为别名等于完整冲突处理**：`__labOnMounted` 只是降低重名概率；如果原组件已使用相同别名，或插件被重复注册，当前实现不会自动去重。
- **在 dev 响应里寻找原始 SFC**：直接请求 `.vue` 得到的是编译后的浏览器模块；要看本插件刚插入的文本，应查看 Inspect 中对应的 TRANSFORM 记录。
- **把页面列表或 chunk 断言当成真实上报**：二者只能分别证明本地回调执行和代码进入产物，不能证明监控服务收到数据。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；如果想对照另一种前置源码转换，可阅读 [移除 console / debugger / 测试代码](./01-strip-debug.md)。
