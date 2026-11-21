# 9. API 自动导入与组件按需引入

在 Vue 项目中反复书写 `import { ref } from 'vue'` 和基础组件导入，会产生大量样板代码。本例让插件在编译前检查源码：确实使用了某个 API 或组件、且当前文件没有同名变量时，才补入对应的 import。

## 先看懂：插件在做什么

一句话概括：**指定 Vue 文件是输入，补齐 import 的 Vue 文件是转换结果，后续消费者拿到的仍然是普通 ES 模块。**

这里的 Vue 文件是 **SFC**（Single File Component，单文件组件），也就是把 `<script>`、`<template>` 和 `<style>` 放在同一个 `.vue` 文件中的组织方式。ES 模块（ESM）则通过 `import` 和 `export` 明确表达依赖，Vite 可以继续解析这些依赖，并在生产构建时进行摇树（tree-shaking，删除未使用的代码）。

流程中的 `transform` 是模块转换钩子，让插件在 Vite 处理模块时修改源码；`buildStart` 是开发服务初始化或正式构建开始时执行的钩子。流程还会生成 `.d.ts` 文件，也就是只描述类型、不提供运行时代码的 TypeScript 声明文件。

```text
src/views/plugins/categories/AutoImportDemo.vue
  输入：脚本使用 ref，模板使用 AutoImportBadge，两者都没有手写 import
        ↓ lab:auto-import 的 transform 转换
补入两条 import 的 SFC 源码
        ↓ @vitejs/plugin-vue 编译
可执行的页面组件模块
        ├─ ref(0) 创建 count → 显示并更新当前计数
        └─ AutoImportBadge 接收 count → 显示同一个计数

同一份插件配置
        ↓ buildStart 生成
src/types/auto-import.d.ts → 编辑器与类型检查
```

因此，本例有两份不同用途的输出：

- `transform` 返回的新 SFC 源码负责**页面运行**。
- `buildStart` 写入的 `.d.ts` 声明负责**静态类型提示**。

它没有把变量挂到 `window`，也没有在浏览器启动时扫描组件。自动导入发生在模块转换阶段，生成的仍是标准 import。

## 一个完整示例：从缺失的 import 到计数页面

### 1. 输入：使用了 API 和组件，却没有导入它们

`src/views/plugins/categories/AutoImportDemo.vue` 的真实 `<script setup>` 只有三行：

```vue
<script setup lang="ts">
const count = ref(0)
</script>
```

`ref` 是 Vue 创建响应式数据的 API：这里得到初始值为 `0` 的 `count`，它变化时，使用它的模板会更新。

模板中与计数有关的内容如下。这里保留了真实标签，省略了其他介绍文字和布局：

```vue
<p data-testid="auto-import-count">当前计数：{{ count }}</p>
<button type="button" data-testid="auto-import-increment" @click="count += 1">
  点击 +1
</button>
<AutoImportBadge :count="count" />
```

当前插件配置提供了两条映射：

| 源码中的名字 | 配置指向 | 需要补入的导入形式 |
| --- | --- | --- |
| `ref` | `vue` | 从 `vue` 中按名字导入 `ref` |
| `AutoImportBadge` | `@/components/auto-import/AutoImportBadge.vue` | 把 `.vue` 文件的默认导出导入为 `AutoImportBadge` |

`include` 又把处理范围限定为 `AutoImportDemo.vue`。所以这不是全项目扫描，只有这个受控示例文件会进入后面的转换逻辑。

### 2. 转换结果：在 `<script setup>` 开始标签后补入两条 import

`lab:auto-import` 检测到一个脚本 API 用法和一个模板组件用法，且脚本里没有它们的已有绑定。“绑定”可以简单理解为当前脚本已经可用的变量名；如果已经导入或声明了同名变量，就不能再声明一次。

下面是插件实际拼接出的主 SFC 脚本结果。两条 import 与真实源码中的生成字符串一致；未改动的 `<template>` 和 `<style>` 在这里省略：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import AutoImportBadge from '@/components/auto-import/AutoImportBadge.vue'
const count = ref(0)
</script>
```

第一种写法是**具名导入**：模块必须导出同名的 `ref`。第二种是**默认导入**：把组件文件的默认导出赋值给本地名字 `AutoImportBadge`，`<script setup>` 随后可以把这个名字暴露给模板使用。

只有源码中实际出现用法时，对应 import 才会注入。配置里即使还有其他映射，只要当前文件没有使用，就不会因为这些映射而增加运行时依赖。

### 3. 消费：Vue 编译页面，路由加载页面，子组件接收计数

转换之后还有三个真实消费者，不能把“插件返回源码”当成流程终点。

**第一位消费者是 `@vitejs/plugin-vue`。** 它接收补好 import 的原始 SFC，再编译脚本和模板。对 Vue 插件来说，这些 import 与开发者手写的 import 没有区别。

**第二位消费者是自动引入的 `AutoImportBadge`。** `src/components/auto-import/AutoImportBadge.vue` 声明了一个数值属性：

```ts
defineProps<{
  count: number
}>()
```

它在模板中显示 `自动引入的组件已渲染，收到计数：{{ count }}`。父页面通过 `<AutoImportBadge :count="count" />` 把当前计数传给它。

**第三位消费者是 Vue Router。** `src/plugin-lab/routes/auto-import.ts` 的完整内容如下：

```ts
import type { RouteRecordRaw } from 'vue-router'

export const autoImportRoutes: RouteRecordRaw[] = [
  {
    path: '/plugins/auto-import',
    name: 'plugin-auto-import',
    component: () => import('@/views/plugins/categories/AutoImportDemo.vue'),
  },
]
```

这个动态 import 是路由原本就有的配置，不是自动导入插件生成的。`src/plugin-lab/routes/index.ts` 展开 `autoImportRoutes`，`src/router/index.ts` 再把它们装入真实路由器；访问路由时，RouterView 渲染对应的页面组件。

### 4. 页面结果：两个位置显示并同步更新同一个计数

打开 `http://localhost:5213/plugins/auto-import` 后，初始页面应显示：

```text
当前计数：0
自动引入的组件已渲染，收到计数：0
```

点击“点击 +1”后，两处都变成 `1`，继续点击则继续同步增加。这个结果同时证明：

- `ref` 已有真实运行时实现，`count` 可以驱动视图更新。
- `AutoImportBadge` 已成为当前 SFC 可用的局部组件，并能接收属性。

`src/plugin-lab/setup/auto-import.ts` 中的 `setupAutoImport` 是空函数，这里没有调用 `app.component()`。组件能渲染依靠的是前面注入的局部 import，而不是应用级全局注册。

## 核心原理：钩子怎样产生转换结果

看完输入和结果，再回头看钩子，重点就是“在正确的时机拿到正确的源码”。钩子是 Vite 在特定阶段调用插件函数的机制。

| 钩子或配置 | 执行时机 | 本例职责 |
| --- | --- | --- |
| `configResolved` | Vite 配置解析完成后 | 保存真实项目根目录 `root`，让 `dts` 相对路径不受启动命令所在目录影响 |
| `buildStart` | dev 服务器初始化和生产构建开始时 | 根据配置生成 `src/types/auto-import.d.ts`；内容没变就不重复写盘 |
| `enforce: 'pre'` 与 `transform` | 模块转换阶段，且早于普通插件 | 在 `@vitejs/plugin-vue` 编译前读取原始 SFC，并返回补入 import 的源码 |

`transform(code, id)` 中，`code` 是当前模块源码，`id` 是 Vite 用来标识模块的路径或内部名称。本例的处理顺序如下：

1. 跳过 `?vue&type=script...` 等带 Vue 子请求参数的模块 ID。它们是 Vue 编译后产生的子块，不能再当作完整 SFC 处理。
2. 去掉模块 ID 中其他查询参数，并把 Windows 的反斜杠路径统一为 `/`。只有匹配 `include` 且以 `.vue` 结尾的主模块才继续。
3. 从源码中提取 `<script setup>` 和 `<template>`。脚本用于检查 API，模板用于检查组件开始标签。
4. 分别执行“发现用法”和“没有已有绑定”两个判断，收集确实缺失的 import。
5. 如果有 import 需要注入，就把它们放到 `<script setup>` 开始标签之后，返回 `{ code: transformed, map: null }`；一条也没有则返回 `undefined`，让后续插件使用原源码。

两个核心循环如下。代码与 `plugins/auto-import/auto-import.ts` 一致，这里省略了前后的过滤、源码提取和位置拼接：

```ts
for (const [identifier, module] of Object.entries(options.imports)) {
  if (hasApiUsage(script, identifier) && !hasBinding(script, identifier)) {
    injected.push(`import { ${identifier} } from '${module}'`)
  }
}

for (const [component, path] of Object.entries(options.components)) {
  if (hasComponentUsage(template, component) && !hasBinding(script, component)) {
    injected.push(`import ${component} from '${path}'`)
  }
}
```

这些判断函数各自只解决一个小问题：

| 实现位置 | 作用 | 当前示例 |
| --- | --- | --- |
| `escapeRegExp` | 转义正则特殊字符，按字面名字构造匹配规则 | 避免把配置名中的特殊字符当成正则语法 |
| `hasApiUsage` | 查找独立的 API 标识符 | 能发现 `ref(0)`，但不把 `obj.ref()` 或 `myRef` 当作这里要找的 `ref` |
| `hasComponentUsage` | 检查模板开始标签 | 匹配 `<AutoImportBadge ...>`，同时排除只是名称前缀相同的标签 |
| `hasBinding` | 检查脚本中是否已有同名声明或 import | 避免给已经导入的 `ref` 再注入一次 |
| `renderDeclarations` | 按配置生成并排序声明文本 | 输出 `ref` 与 `AutoImportBadge` 的类型声明 |

`enforce: 'pre'` 很关键：即使配置数组中的 `vue()` 写在前面，这个转换仍属于前置插件转换，可以先于 Vue 的正常 SFC 编译执行。`map: null` 则表示本教学例没有为这次字符串插入提供 source map（源码位置映射），不代表转换结果被省略。

## 配置接入

当前项目已经接好插件，可以按“示例配置 → 共享 Vite 配置 → 路径与类型配置”的顺序阅读。

### 1. 配置处理范围和映射

`plugins/auto-import/index.ts` 中的完整示例配置是：

```ts
import type { Plugin } from 'vite'
import { autoImportPlugin } from './auto-import.ts'

export function autoImportPlugins(): Plugin[] {
  return [
    autoImportPlugin({
      include: /\/src\/views\/plugins\/categories\/AutoImportDemo\.vue$/,
      imports: {
        ref: 'vue',
      },
      components: {
        AutoImportBadge: '@/components/auto-import/AutoImportBadge.vue',
      },
      dts: 'src/types/auto-import.d.ts',
    }),
  ]
}
```

四个选项不能混为一谈：

- `include` 决定**哪些文件允许转换**。
- `imports` 描述“API 名 → 提供同名具名导出的模块”。
- `components` 描述“组件名 → 提供默认导出的组件路径”。
- `dts` 决定**声明文件写到哪里**；它是可选配置，不影响 import 的判断和注入。

### 2. 展开进共享 Vite 配置

`vite.config.ts` 已导入并展开 `autoImportPlugins()`。下面分别摘录真实的导入语句和 `plugins` 属性，属性中的其他插件省略：

```ts
import { autoImportPlugins } from './plugins/auto-import/index.ts'
```

```ts
plugins: [
  // 其他插件省略
  ...autoImportPlugins(),
  // 其他插件省略
  inspect(),
],
```

完整配置还注册了 `vue()` 和 `inspect()`。前者负责后续 SFC 编译，后者提供 `/__inspect/` 转换检查页面。

### 3. 保证组件路径对 Vite 和 TypeScript 都可解析

组件映射使用了 `@`，它不是自动导入插件自己实现的别名。`vite.config.ts` 中的真实配置是：

```ts
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
},
```

`tsconfig.json` 同时配置了 `"paths": { "@/*": ["src/*"] }`，并通过 `"include"` 纳入 `src/**/*.d.ts`。因此，运行时 import 和声明文件中的 `typeof import('@/components/...')` 才能各自被正确理解。新增其他组件映射时，也要保证两边使用一致的路径约定。

## 类型声明：另一份输出为什么不能让页面独立运行

`buildStart` 生成的 `src/types/auto-import.d.ts` 当前完整内容如下：

```ts
/* 由 plugins/auto-import/auto-import.ts 生成，请勿手动编辑。 */

export {}

declare global {
  const ref: typeof import('vue')['ref']
}

declare module 'vue' {
  interface GlobalComponents {
    AutoImportBadge: typeof import('@/components/auto-import/AutoImportBadge.vue')['default']
  }
}
```

这份声明可以从三个部分理解：

- `export {}` 让文件成为一个模块，避免其中的模块增强写法被误当成普通全局脚本。
- `declare global` 告诉 TypeScript：原始脚本虽然还没经过 Vite 转换，但可以按 Vue 的 `ref` 类型理解这个标识符。
- 对 `vue` 模块的 `GlobalComponents` 增强，让模板中的 `AutoImportBadge` 获得组件及属性类型提示。

声明是按 `imports` 和 `components` 配置生成的，并对名字排序以保持稳定；它不会根据当前 SFC 是否实际使用某项而删减。运行时 import 则仍由 `transform` 按实际用法注入，两条链路不要混淆。

**`.d.ts` 只描述类型，不提供运行时代码。** 如果删掉 `transform` 而只保留声明，浏览器仍会遇到未定义的 `ref`，模板也不会因为 `GlobalComponents` 自动得到组件实现。反过来，页面能运行也不代表类型声明一定存在或正确。

### 自动导入不等于全局注册

| 方式 | 运行时代码 | 依赖与适用特点 |
| --- | --- | --- |
| 本例自动导入 | 每个实际使用组件的 SFC 获得局部 import | 依赖关系留在模块图中；未使用的映射不会注入，利于摇树和按需加载 |
| `app.component()` 全局注册 | 应用启动时把组件放进全局注册表 | 组件通常先进入主包，适合确实跨页面高频使用的基础组件 |

即使声明中出现了 `GlobalComponents`，运行时也没有调用 `app.component()`。这个接口在这里只用于编辑器理解模板，不改变组件的注册方式。

## 验证步骤

### 1. 检查页面是否真正消费了两条 import

```bash
pnpm exec vite --port 5213
```

打开 <http://localhost:5213/plugins/auto-import>。

预期结果：页面出现“当前计数：0”和“自动引入的组件已渲染，收到计数：0”。点击“点击 +1”后，两处都变为 `1`；继续点击仍同步更新。若组件无法解析或 `ref` 没有运行时导入，就无法得到这个完整结果。

### 2. 检查 Vue 编译前的真实转换

打开 <http://localhost:5213/__inspect/>，搜索 `/src/views/plugins/categories/AutoImportDemo.vue`，在 TRANSFORM STACK 中选择 `lab:auto-import`。

预期结果：转换输入中没有 `ref` 和 `AutoImportBadge` 的 import；转换输出的 `<script setup>` 开始标签后出现前面展示的两条 import。`lab:auto-import` 的转换发生在 `vite:vue` 之前，`<template>` 和 `<style>` 不被这一步改写。

也可以请求 dev 模块：

```bash
curl -s http://localhost:5213/src/views/plugins/categories/AutoImportDemo.vue
```

预期结果：返回的是经过 Vue 后续编译的 JavaScript，而不是原始 SFC；其中仍能看到 `ref` 和 `AutoImportBadge` 的模块依赖。dev 服务可能把 `vue` 和 `@/...` 重写成可请求的服务器路径，因此核对依赖是否存在即可，精确的 SFC 注入位置以 Inspect 中 `lab:auto-import` 的输出为准。

### 3. 检查声明文件是否生成

dev 启动后查看 `src/types/auto-import.d.ts`。

预期结果：文件包含 `const ref: typeof import('vue')['ref']`，以及 `GlobalComponents` 中的 `AutoImportBadge` 声明，路径与当前配置一致。重复启动时，如果配置和生成文本没有变化，文件内容应保持不变，不会因无条件写盘而反复触发监听更新。

### 4. 检查生产构建和产物页面

```bash
pnpm build
pnpm exec vite preview --port 5313
```

预期结果：`pnpm build` 正常完成，`dist/` 生成应用产物；由于示例路由使用动态 import，该页面会进入独立的懒加载 JavaScript 文件（chunk）。打开 <http://localhost:5313/plugins/auto-import>，直接刷新仍能看到页面，点击计数后两处同步更新。构建和运行都不需要浏览器去加载 `auto-import.d.ts`，因为类型声明不是运行时依赖。

开发指南可通过“插件开发指南 → 3. 按需导入 / 自动引入 → 9. API 自动导入与组件按需引入”访问。

## 进阶参考

::: details 生产级实现还需补齐

- **用语法分析代替正则猜测作用域。** 当前实现不知道注释、字符串、解构、函数参数、块级阴影、import 别名和复杂重新导出，可能漏判或误判。生产项目应使用抽象语法树（AST，把源码解析成结构化语法节点）分析作用域，并优先评估 `unplugin-auto-import` 与 `unplugin-vue-components`，不要继续堆正则。
- **用真正的 SFC 解析器处理复杂文件。** 示例假定单个标准 `<script setup>` 和 `<template>`；多脚本、宏中的特殊语法及自定义块都超出了当前提取方式的能力。
- **扩展导入模型。** API 映射假定“本地标识符就是模块的同名具名导出”，组件映射假定“.vue 默认导出”。重命名导出、命名空间导入等需要更明确的配置模型。
- **控制扫描成本并维护缓存。** 必须限制处理范围；对全仓库做字符串扫描容易改变无关代码，也会增加每次转换成本。生产插件还需要缓存，并准确监听配置和映射来源。
- **补齐 source map。** `map: null` 是教学简化，表示不提供这次转换的源码位置映射。生产插件应生成或串联 source map，避免调试位置漂移。
- **约定生成文件的协作方式。** 可像本例一样保留稳定的最小声明供编辑器直接使用，或由团队约定忽略生成目录；无论选择哪种方式，都要保证首次启动时生成，并保证持续集成（CI）与本地行为一致。

:::

::: details 常见坑

- **丢掉 `enforce: 'pre'`**：如果等 Vue 编译后才处理，拿到的已不是原始 SFC，脚本注入位置和模板检测都会失效。
- **把 Vue 子请求当成主 SFC**：`?vue&type=script...` 等子请求包含编译后的代码，不能再次按完整 SFC 转换；Windows 路径也必须先统一分隔符再匹配 `include`。
- **重复注入 import**：已有同名声明或导入时再次注入会产生重复绑定，导致编译错误。当前检查只覆盖受控语法，生产方案还要完整处理别名和不同作用域。
- **把声明文件当作运行时注册**：`.d.ts` 不改变产物，也不会调用 `app.component()`；真正让 API 和组件工作的是注入的 import。
- **只配置一端的 `@` 别名**：组件路径必须同时被 Vite 和 TypeScript 解析，否则可能出现页面能跑但类型报错，或类型通过但构建无法解析。
- **为了省事放开全仓库转换**：这不仅变慢，还可能因正则误判修改无关源码。本例只处理一个固定演示 SFC，不能直接把这套受控实现当作任意业务仓库的通用方案。

:::

插件钩子顺序和 Inspect 的基础用法可回看 [ch10 Vite 插件机制](../../guide/ch10-plugins.md)。
