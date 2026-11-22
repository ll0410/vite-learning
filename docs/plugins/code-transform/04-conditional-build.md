# 08 生产配置替换与条件编译

> 对应源码：`plugins/code-transform/conditional-build.ts` 与 `src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts`。

同一份受控 fixture（固定示例输入）需要在开发服务器（dev）中保留占位符和诊断代码，在生产构建（build）中写入公开服务地址、打开公开实验开关，并删除开发期诊断代码。本例用一个很短的模块完整演示这个过程。

这里的“条件编译”是指：**在构建阶段决定哪些代码进入产物**，而不是把代码全部交给浏览器，再用运行时 `if` 隐藏。本例的条件就是“当前是否执行生产构建”。

**占位符和替换值都只能包含公开 URL、公开布尔开关。不能把私密配置打包**：JS 产物、source map 和压缩文件都可能被下载、检索，秘密必须留在服务端。

::: tip 现成方案速览
- **官方 / 成熟方案**：Vite 官方 `import.meta.env` / `define` 配合 Oxc 死代码消除；需要按标签删除时用 `dropLabels`，HTML 可用 `%MODE%` 替换。
- **覆盖程度**：**官方已覆盖**。
- **本例定位**：教学用最小实现，重点是理解条件为什么必须写成静态可判定的形式，才能被安全裁剪。
- **值得自研的时机**：需要对非 JS 文本做与发布流程绑定的产物替换时（见第 21 篇）。
:::

## 先看懂：一份源码如何变成两种结果

```text
conditional-build-fixture.ts（固定输入）
        ↓ 分类页副作用导入，进入 Vite 模块图
conditionalBuildPlugin 是否生效？
        ├─ dev：不生效，原样执行
        │      → 保留占位配置和 DEV_ONLY 诊断哨兵
        │
        └─ build：删除 DEV_ONLY 块，再替换公开占位符
               → 打包、压缩
               → 产物只执行公开配置赋值，不再创建诊断哨兵
```

模块执行时会把结果挂到 `globalThis`，因此除了检查源码和产物，还可以在页面控制台观察差异。分类页本身只展示说明和指南链接，**不会把这些配置渲染成页面文本**。

## 核心示例：公开配置与 DEV_ONLY 块

### 1. 输入：dev 中也能直接执行的模块

下面是 `src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts` 的完整内容：

```ts
// dev 中占位符仍是字符串，比较表达式让公开布尔开关默认为 false。
export const conditionalBuildPublicConfig = Object.freeze({
  apiOrigin: '__LAB_PUBLIC_API_ORIGIN__',
  labsEnabled: '__LAB_PUBLIC_LABS_ENABLED__' === 'true',
})
Object.assign(globalThis, { conditionalBuildPublicConfig })

// DEV_ONLY:start
Object.assign(globalThis, {
  conditionalBuildDevOnlySentinel: 'CONDITIONAL_BUILD_DEV_ONLY_SENTINEL',
})
// DEV_ONLY:end
```

这里有两个占位符，以及一个由独立标记行包围的 `DEV_ONLY` 块。`Object.assign(globalThis, ...)` 是特意保留的可观察副作用：配置对象和诊断哨兵都能从浏览器控制台读取。

布尔开关没有直接写未加引号的 `__LAB_PUBLIC_LABS_ENABLED__`，而是比较两个字符串。这样 dev 不需要先转换也能运行：

```ts
'__LAB_PUBLIC_LABS_ENABLED__' === 'true' // false
```

### 2. 转换结果：先删块，再替换占位符

生产构建时，插件先删除 `DEV_ONLY:start`、`DEV_ONLY:end` 以及它们之间的所有行，再执行两处 `replaceAll`。下面是压缩前的核心转换结果（省略文件首行说明注释和末尾空行）：

```ts
export const conditionalBuildPublicConfig = Object.freeze({
  apiOrigin: 'https://public-api.example.com',
  labsEnabled: 'true' === 'true',
})
Object.assign(globalThis, { conditionalBuildPublicConfig })
```

注意布尔值的中间形态：占位符位于引号内，所以替换后先得到 `'true' === 'true'`，而不是在这一步直接把整个表达式换成裸 `true`。该表达式的求值结果确实是布尔值 `true`，后续压缩器还能把它折叠成 `!0`；`!0` 只是压缩后的 `true`。

dev 与 build 的可观察结果如下：

| 观察项 | dev：插件不运行 | build：转换并打包后 |
| --- | --- | --- |
| `conditionalBuildPublicConfig.apiOrigin` | `'__LAB_PUBLIC_API_ORIGIN__'` | `'https://public-api.example.com'` |
| `conditionalBuildPublicConfig.labsEnabled` | `false` | `true`，压缩产物中可能写作 `!0` |
| `globalThis.conditionalBuildDevOnlySentinel` | 被赋值为 `'CONDITIONAL_BUILD_DEV_ONLY_SENTINEL'` | 对应代码被删除，不创建该属性 |

公开地址和布尔开关在构建后固定，不能在同一份产物中运行时切换。示例只保存 URL，没有发起 API 请求，因此不应期待页面出现网络请求效果。

### 3. 消费者：分类页让 fixture 进入模块图

`src/views/plugins/categories/CodeTransformDemos.vue` 使用下面这行导入（这里只摘录本例相关行，省略其他脚本与模板）：

```ts
import '@/plugin-lab/fixtures/code-transform/conditional-build-fixture'
```

没有导入变量、直接写模块路径的写法叫“副作用导入”：目的不是取得某个导出，而是让模块加载并执行。它有两个作用：

1. 把 fixture 纳入分类页的依赖图，使生产构建会经过这个模块。
2. 页面加载对应 chunk 后，执行前面的 `Object.assign(globalThis, ...)`，让结果可在控制台观察。

如果没有这条导入，fixture 不会随分类页进入构建，插件即使配置正确也没有机会在页面产物中处理它。

### 4. 页面与构建结果：看什么，不看什么

打开 `/plugins/code-transform#conditional-build`，页面面板仍然只显示“本项不提供 dev 效果示例”等说明，这是源码中的固定内容，不代表插件没有运行。

真正的结果是：

- **dev 页面运行时**：公开配置仍含占位符，`labsEnabled` 为 `false`，诊断哨兵存在。
- **生产产物**：占位符和唯一诊断哨兵消失，公开 URL 存在，开关为 `true` 或压缩后的 `!0`。
- **生产预览运行时**：公开配置使用新值，诊断哨兵为 `undefined`。

后面的验证步骤会分别检查这三类证据。

## 实现原理：transform 在哪里介入

插件由 `conditionalBuildPlugin()` 创建，名称为 `lab:conditional-build`。三个关键配置分别解决不同问题：

- `apply: 'build'`：只在生产构建中启用，dev 保留原始模块作为对照。
- `enforce: 'pre'`：把转换放到前置插件阶段，在 TypeScript 转译和压缩前处理接近原始源码的文本。
- `transform(code, id)`：接收当前模块源码 `code` 和模块标识 `id`，返回改写后的源码；不匹配的模块返回 `undefined`，表示不修改。

`targetModule` 固定为 `/src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts`。下面是插件的完整 `transform` 钩子，省略的是外层插件工厂、导入和说明注释：

```ts
transform(code, id) {
  // Vite 模块 ID 可能带 ?query；去掉查询部分后再限定目标文件，避免误改其他模块。
  const cleanId = id.split('?', 1)[0]
  if (!cleanId.endsWith(targetModule)) return

  // 标记行本身也不保留；inDevOnlyBlock 为 true 时过滤标记之间的每一行。
  let inDevOnlyBlock = false
  const withoutDevOnly = code
    .split('\n')
    .filter((line) => {
      if (/^\s*\/\/\s*DEV_ONLY:start\s*$/.test(line)) {
        inDevOnlyBlock = true
        return false
      }
      if (/^\s*\/\/\s*DEV_ONLY:end\s*$/.test(line)) {
        inDevOnlyBlock = false
        return false
      }
      return !inDevOnlyBlock
    })
    .join('\n')

  // 占位符替换发生在源码转换阶段，业务模块收到的是替换后的 JavaScript 表达式。
  const transformed = withoutDevOnly
    .replaceAll('__LAB_PUBLIC_API_ORIGIN__', 'https://public-api.example.com')
    .replaceAll('__LAB_PUBLIC_LABS_ENABLED__', 'true')

  // 本例未生成 source map；map: null 明确表示不提供映射，真实项目应保留准确行列信息。
  return { code: transformed, map: null }
}
```

按执行顺序阅读这段代码：

1. **限定目标模块**：`id.split('?', 1)[0]` 去掉查询部分，`endsWith(targetModule)` 确保只处理指定 fixture，而不是扫描或改写整个项目。
2. **逐行删块**：开始标记让 `inDevOnlyBlock` 变为 `true`，结束标记恢复为 `false`；两个标记行以及块内每一行都会被过滤。只有独占一行、符合正则的标记才会被识别。
3. **替换公开值**：删块完成后才执行 `replaceAll`，所以被删块中的内容不会进入后续替换结果。当前目标模块内所有匹配文本都会被替换。
4. **交还构建管线**：返回的新 `code` 继续参与后续转译、打包和压缩。`map: null` 表示本次改写没有提供 source map（把产物行列映射回源码位置的调试信息），并不表示“代码没有转换”。

这套逐行过滤和全文字符串替换只适合当前受控输入，不能直接当作通用条件编译器。

## 配置接入：插件已经注册

`plugins/code-transform/index.ts` 中的相关代码如下（省略其他导入，数组内容与真实注册顺序一致）：

```ts
import { conditionalBuildPlugin } from './conditional-build.ts'

export function codeTransformPlugins(): Plugin[] {
  return [stripDebugPlugin(), injectTrackingPlugin(), tenantBuildPlugin(), conditionalBuildPlugin()]
}
```

共享 `vite.config.ts` 已经通过 `...codeTransformPlugins()` 展开该数组，位置在 `buildStampPlugin()` 之后、`autoImportPlugins()` 之前，因此本例不需要再修改共享配置。配置文件中的本地导入保留 `.ts` 后缀，与项目现有写法一致。

数组顺序不是所有钩子的唯一排序依据，还要看 `apply` 和 `enforce`。对这个 fixture 的生产构建来说，数组中排在前面的 `stripDebugPlugin()` 也属于前置插件，会先检查源码，但本 fixture 没有命中它的删除规则；随后才由本插件删块和替换。`injectTrackingPlugin()` 只处理指定 Vue 单文件组件，`tenantBuildPlugin()` 则通过 `config` 和 `define` 工作。

`src/types/code-transform.d.ts` 目前只声明租户示例的四个 `__TENANT_*__` 常量。本例占位符位于字符串中，全局属性通过 `Object.assign` 动态写入，现有 TypeScript 代码没有直接访问这些新属性，所以不需要额外类型声明。如果业务代码开始直接读取 `globalThis.conditionalBuildPublicConfig`，再补充相应的 `GlobalThis` 类型声明。

## 验证步骤

### 1. dev 对照：占位符和诊断代码都保留

启动开发服务器：

```bash
pnpm exec vite --port 5212
```

在另一个终端请求 fixture，并执行断言：

```bash
node --input-type=module <<'NODE'
const source = await (
  await fetch('http://localhost:5212/src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts')
).text()
for (const token of [
  '__LAB_PUBLIC_API_ORIGIN__',
  '__LAB_PUBLIC_LABS_ENABLED__',
  'CONDITIONAL_BUILD_DEV_ONLY_SENTINEL',
]) {
  if (!source.includes(token)) throw new Error('dev 缺少 ' + token)
}
console.log('dev 对照断言通过')
NODE
```

预期输出为 `dev 对照断言通过`。如果开发服务器未启动，或某个 token 已被提前替换，脚本会抛错而不是打印通过信息。

再打开 <http://localhost:5212/plugins/code-transform#conditional-build>，在浏览器控制台依次执行：

```js
globalThis.conditionalBuildPublicConfig
// { apiOrigin: '__LAB_PUBLIC_API_ORIGIN__', labsEnabled: false }

globalThis.conditionalBuildDevOnlySentinel
// 'CONDITIONAL_BUILD_DEV_ONLY_SENTINEL'
```

页面面板没有配置值或诊断信息的变化是正常现象；这里观察的是模块源码和运行时全局属性。

### 2. build 产物：替换公开值并删除唯一哨兵

```bash
pnpm build

node --input-type=module <<'NODE'
import { readdirSync, readFileSync } from 'node:fs'

const output = readdirSync('dist/assets')
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync('dist/assets/' + file, 'utf8'))
  .join('\n')

for (const token of [
  '__LAB_PUBLIC_API_ORIGIN__',
  '__LAB_PUBLIC_LABS_ENABLED__',
  'CONDITIONAL_BUILD_DEV_ONLY_SENTINEL',
]) {
  if (output.includes(token)) throw new Error('产物仍包含 ' + token)
}
if (!output.includes('https://public-api.example.com')) {
  throw new Error('缺少公开生产 URL')
}
if (!/labsEnabled:\s*(?:true|!0)/.test(output)) {
  throw new Error('公开布尔开关未启用')
}
console.log('conditional-build 产物断言通过')
NODE
```

预期输出为 `conditional-build 产物断言通过`。断言扫描 `dist/assets` 下所有 JS 文件，不需要猜测带哈希的 chunk 文件名；布尔断言同时接受 `true` 和压缩形式 `!0`。

这里检查的是唯一哨兵 `CONDITIONAL_BUILD_DEV_ONLY_SENTINEL`，不要只搜索泛化的 `DEV_ONLY` 文本，因为指南入口或其他说明文字可能合法提到这个概念。

### 3. 生产预览：确认运行时确实使用了转换结果

```bash
pnpm exec vite preview --port 5312
```

打开 <http://localhost:5312/plugins/code-transform#conditional-build>，在浏览器控制台执行：

```js
globalThis.conditionalBuildPublicConfig
// { apiOrigin: 'https://public-api.example.com', labsEnabled: true }

globalThis.conditionalBuildDevOnlySentinel
// undefined
```

预期公开配置已经更新，诊断属性不存在。`vite preview` 只提供已构建产物，不会重新执行 `apply: 'build'` 的转换，因此这一步必须先完成上一步的生产构建。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 生产级实现还需补齐

- 使用 AST（抽象语法树，即把源码解析成语句、表达式等结构化节点）或经过验证的替换工具，区分表达式、注释和字符串边界，并生成准确的 source map。当前逐行过滤和 `replaceAll` 只服务受控 fixture；`map: null` 也不适合需要可靠断点和错误堆栈映射的复杂转换。
- 对公开 URL 做协议和格式校验，对布尔值做结构/类型校验，并检查标记是否成对、是否嵌套、是否存在未知残留；发现非法输入时应明确终止构建，而不是悄悄生成语义不明的代码。
- 为不同环境提供可审计的公开配置来源和产物检查，同时扫描秘密。不能把“占位符已替换”误当成完整安全配置，也不能把前端布尔开关当作权限控制。
- 明确 `DEV_ONLY` 块内副作用的语义。如果生产逻辑依赖它，删除后应通过测试暴露问题，而不是悄悄改变行为。
- 如果需求是在同一份产物中运行时切换配置，应改用受控的运行时配置方案；本例的值随构建固定，修改后需要重新构建。

:::

::: details 常见坑

- **期待 dev 也执行替换**：`apply: 'build'` 故意让 dev 保留对照输入，否则还可能让本地环境误用生产公开 URL。
- **只注册插件，却没有导入 fixture**：模块未进入构建图就不会随分类页被打包；本例依靠分类页的副作用导入建立这条链路。
- **把未加引号的标识符占位符直接交给 dev**：会产生未定义变量。本例把占位符放在字符串比较中，保证 dev 模块本身合法、可执行。
- **把全文替换当作通用语法转换**：`replaceAll` 不区分代码、字符串和注释，目标模块中的匹配文本都会被替换；扩大适用范围前必须重新设计并补测试。
- **标记未闭合或嵌套**：当前实现不会校验配对。未闭合的开始标记会导致后续内容一直删除到文件末尾，嵌套块也不能正确表达；生产实现必须报错。
- **把私密 URL、token 或密码当公开配置**：只要进入浏览器产物就应视为公开，禁止写入。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；如果想对比 `define` 在配置阶段注入常量的做法，可阅读 [多租户 / 多品牌差异化构建](./03-tenant-build.md)。
