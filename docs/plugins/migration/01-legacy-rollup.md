# 23. 复用老工具链中的 Rollup 兼容逻辑

一个内部 Rollup 插件已经稳定运行：它替换指定模块中的发布标记，再生成 JSON 记录替换结果。迁移到 Vite 时，最值得保留的不是某段配置，而是这套已经验证过的模块转换与产物生成逻辑。

本例把核心插件原样放进很薄的 Vite 适配层。先不看钩子，先看它到底接收什么、产出什么，以及怎样确认迁移没有误伤其他模块。

## 先看结果：一个额外 chunk，一份验收 JSON

一句话概括：**插件额外发出一个 fixture 入口 chunk，只转换入口模块，保留依赖模块中的原标记，再用 JSON 告诉检查脚本去哪里验收。**

这里的 fixture 是专门用于验收的受控输入；chunk 是由模块入口及其依赖生成的 JavaScript 构建产物。

```text
legacy-entry.ts ──导入──> untouched.ts
      │ 精确转换                 │ 不转换
      ▼                          ▼
reused-legacy-rollup-value   原占位符保留
      └──────── 汇入同一个额外 chunk ────────┘
                           │
                           ▼
             legacy-rollup-migration.json
                           │
                           ▼
             构建后脚本读取元数据并检查 chunk
```

这里的“额外 chunk”是指插件把 fixture 注册成独立构建入口后生成的 JavaScript 产物，不是应用页面主动 import 的业务 chunk。

### 1. 输入：两个含有相同标记的模块

`src/plugin-lab/fixtures/migration/legacy-entry.ts` 是明确允许转换的入口：

```ts
import { untouchedMarker } from './untouched'

const migratedMarker = '__LEGACY_ROLLUP_MESSAGE__'

Object.assign(globalThis, {
  __legacyRollupMigrationFixture: { migratedMarker, untouchedMarker },
})
```

它导入的 `src/plugin-lab/fixtures/migration/untouched.ts` 故意含有同一个标记：

```ts
export const untouchedMarker = '__LEGACY_ROLLUP_MESSAGE__'
```

`Object.assign(globalThis, ...)` 给两个标记一个运行时用途，避免这个仅用于验收的入口被 tree-shaking（移除未使用代码的优化）裁成没有可检查内容的空 chunk。这个副作用只存在于 fixture，不是迁移文本替换插件时都必须照抄的步骤。

### 2. 输出：只换入口的标记，不换依赖的标记

构建完成后，额外 chunk 中应同时能观察到两类内容：

| 来源 | 构建产物中的预期内容 | 数量 |
| --- | --- | --- |
| `legacy-entry.ts` | `reused-legacy-rollup-value` | 1 次 |
| `untouched.ts` | `__LEGACY_ROLLUP_MESSAGE__` | 1 次 |

这两个结果必须一起检查。只搜索到新值，无法证明插件没有把整个模块图中的同名标记全部替换；只统计新值，也无法证明它替换的是授权入口。

同时，构建输出目录中会多出 `dist/legacy-rollup-migration.json`。其字段契约如下：

```json
{
  "plugin": "lab:legacy-rollup",
  "source": "src/plugin-lab/fixtures/migration/legacy-entry.ts",
  "output": "assets/legacy-rollup-fixture-<hash>.js",
  "placeholder": "__LEGACY_ROLLUP_MESSAGE__",
  "replacement": "reused-legacy-rollup-value",
  "replacements": 1
}
```

这是依据实现绘制的结构示意，不是某次已执行构建的记录。`output` 中的 `<hash>` 代表由构建器计算的文件名部分，不能照抄成真实路径；实际文件路径必须以 JSON 中当次构建的值为准。

### 3. 消费：用元数据找到真实产物，而不是打开演示页

本例没有专用 Vue 演示页。`src/plugin-lab/catalog/migration.ts` 将该项标为 `buildOnly: true`，实验首页据此显示“构建验证”和验收说明；`src/plugin-lab/routes/migration.ts` 的路由数组为空，`src/plugin-lab/setup/migration.ts` 也没有运行时初始化逻辑。

因此，**可观察结果在 `dist`，不在某个浏览器路由里**。消费者是构建后的检查流程：先读 `legacy-rollup-migration.json`，再通过 `output` 找到带 hash 的真实 chunk，最后同时断言新值、旧值和替换次数。后文给出完整命令。

## 再看实现：三个 Rollup 钩子如何产生上述结果

完整源码位于 `plugins/migration/legacy-rollup.ts`。下面节选的三个方法都属于 `createLegacyRollupPlugin()` 返回的核心插件对象；常量、闭包变量声明和其余上下文在此省略，可在完整源码中对照。

### 1. `buildStart`：登记额外入口，并准备本次构建状态

```ts
buildStart() {
  replacements = 0
  fixtureReference = this.emitFile({
    type: 'chunk',
    id: FIXTURE_ENTRY,
    name: 'legacy-rollup-fixture',
  })
}
```

`this.emitFile` 可以理解为“向本次构建登记一个由构建器负责输出的文件”，而不是在钩子中自行拼接路径写盘。这里 `type: 'chunk'` 表示把 `FIXTURE_ENTRY` 注册为额外 JavaScript 入口；`id` 指向已有的 fixture 源文件，`name` 提供产物命名依据。

`emitFile` 返回的 `fixtureReference` 是一个 **referenceId（文件引用 ID）**。此时最终文件名还没有确定，所以先保存这个内部引用，稍后再换取真实路径。

`replacements = 0` 则是每次构建都必须做的状态重置。否则 watch（监听文件变化并重复构建）模式下，上一次计数可能污染下一份元数据。

> **额外发出入口与转换已有模块是两件事。** `buildStart + emitFile` 决定“哪个入口也进入本次构建”；接下来的 `transform` 决定“某个已经进入模块图的文件内容怎样改变”。

### 2. `transform`：只转换绝对路径完全相等的入口

```ts
transform(code, id) {
  if (id !== FIXTURE_ENTRY) return

  const segments = code.split(PLACEHOLDER)
  replacements = segments.length - 1
  if (replacements === 0) return

  return { code: segments.join(REPLACEMENT), map: null }
}
```

`FIXTURE_ENTRY` 是相对于当前插件文件定位、再由 `fileURLToPath` 转成的绝对路径，指向 `src/plugin-lab/fixtures/migration/legacy-entry.ts`。`transform` 会经过许多模块，但这里不用 `includes` 做模糊匹配：

- `id === FIXTURE_ENTRY`：统计 `__LEGACY_ROLLUP_MESSAGE__`，返回替换后的源码，`replacements` 为 1。
- 其他模块（包括 `untouched.ts`）：裸 `return` 等同返回 `undefined`，本插件不修改它们。
- 授权入口没有标记：计数为 0，不返回转换结果。

`map: null` 表示这段最小文本替换没有生成 sourcemap（从构建产物映射回源码的信息）。它足以演示受控 fixture，却不是任意 JavaScript/TypeScript 改写的通用方案。

### 3. `generateBundle`：把引用 ID 换成真实文件名，再发出 JSON

```ts
generateBundle() {
  const output = this.getFileName(fixtureReference)
  const metadata = {
    plugin: 'lab:legacy-rollup',
    source: 'src/plugin-lab/fixtures/migration/legacy-entry.ts',
    output,
    placeholder: PLACEHOLDER,
    replacement: REPLACEMENT,
    replacements,
  }

  this.emitFile({
    type: 'asset',
    fileName: 'legacy-rollup-migration.json',
    source: `${JSON.stringify(metadata, null, 2)}\n`,
  })
}
```

`generateBundle` 是产物已经生成、即将写入输出目录时运行的构建钩子。此时 chunk 的最终文件名已经确定，`this.getFileName(referenceId)` 才能把之前保存的引用 ID 解析成实际的 `output`。

**hash 文件名**是构建器根据产物内容和命名规则生成的文件名。源码或配置变化后，hash 也可能变化，所以元数据不能硬编码 `assets/legacy-rollup-fixture.js`，而要从 `getFileName` 取当次结果。

最后再次调用 `emitFile`，这次 `type: 'asset'` 表示登记普通静态产物。与前面发出 chunk 不同，这里使用固定的 `fileName: 'legacy-rollup-migration.json'`，把六个字段序列化为 JSON，供构建后的消费者读取。

把结果与钩子对应起来，就是：

```text
buildStart
  重置 replacements → 发出额外 chunk → 保存 referenceId
        ↓
transform
  精确匹配 legacy-entry.ts → 替换 1 次 → untouched.ts 保持原样
        ↓
generateBundle
  getFileName(referenceId) → 取得真实 output → 发出验收 JSON
```

## 为什么还要包一层 Vite adapter

核心对象使用的是 Rollup 风格钩子。本例直接复用的正是 `buildStart`、`transform`、`generateBundle`，以及插件上下文中的 `emitFile`、`getFileName`，没有为它们重写函数体。

Vite 适配层只负责接入策略：

```ts
export function legacyRollupPlugin(): Plugin {
  return {
    ...createLegacyRollupPlugin(),
    name: 'lab:legacy-rollup',
    apply: 'build',
  }
}
```

对象展开会保留核心插件的全部钩子，随后两项覆盖或补充配置：

- `name` 将核心的 `legacy-rollup-compatible-core` 统一覆盖为 `lab:legacy-rollup`，与元数据中的 `plugin` 字段一致。
- `apply: 'build'` 是 Vite 专属声明，让该插件只在构建时生效，不在开发服务器中执行这套产物验收逻辑。

所以，这里的“Rollup 兼容层”不是把每个 Rollup API 翻译成另一套 API 的庞大运行时，而是**保留兼容核心，用很薄的适配对象补充 Vite 名称与执行模式**。它也不意味着任意 Rollup 插件只要加上 `apply: 'build'` 就一定等价工作，更不意味着 webpack 的 compiler、loader 或 Tapable 钩子会自动获得兼容。

## 配置接入

仓库中的 `plugins/migration/index.ts` 注册的是适配后的插件：

```ts
import type { Plugin } from 'vite'
import { legacyRollupPlugin } from './legacy-rollup.ts'

export function migrationPlugins(): Plugin[] {
  return [legacyRollupPlugin()]
}
```

`vite.config.ts` 已在插件数组中展开该分类：

```ts
// plugins 数组中的相关行，其余插件省略
...migrationPlugins(),
```

无需为本例新增依赖，也无需修改 Vue 应用入口。反过来，由于 `apply: 'build'`，在 dev 页面里等待这份 JSON 或期待 `generateBundle` 执行，本身就是选错了观察场景。

## 验证：让 JSON 带你找到真实 chunk

以下命令需要在仓库根目录自行执行。先运行应用构建：

```bash
pnpm build
```

预期命令成功退出，并生成 `dist/legacy-rollup-migration.json` 和其 `output` 指向的额外 chunk。不要预先猜定 chunk 的 hash。

再运行下面的只读断言脚本：

```bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const metadata = JSON.parse(
  readFileSync('dist/legacy-rollup-migration.json', 'utf8'),
)

assert.equal(metadata.plugin, 'lab:legacy-rollup')
assert.equal(
  metadata.source,
  'src/plugin-lab/fixtures/migration/legacy-entry.ts',
)
assert.equal(metadata.placeholder, '__LEGACY_ROLLUP_MESSAGE__')
assert.equal(metadata.replacement, 'reused-legacy-rollup-value')
assert.equal(metadata.replacements, 1)
assert.ok(existsSync(`dist/${metadata.output}`), '元数据必须引用真实产物')

const code = readFileSync(`dist/${metadata.output}`, 'utf8')
assert.equal(
  code.split(metadata.replacement).length - 1,
  metadata.replacements,
  '授权 fixture 应完成且只完成一次替换',
)
assert.equal(
  code.split(metadata.placeholder).length - 1,
  1,
  '未授权的 untouched.ts 必须保留原标记',
)

console.log(`legacy Rollup hooks OK: ${metadata.output}`)
NODE
```

成功时的可观察结果是终端打印 `legacy Rollup hooks OK: `，后接当次真实的 `metadata.output`。若 JSON 缺失、`output` 指向不存在的文件、替换次数错误或 `untouched.ts` 被误改，脚本会以断言失败退出。手工检查时，也应先打开 JSON，再沿着 `output` 打开 chunk。

## Rollup 兼容不等于所有环境完全等价

本例展示的是一组具体钩子在当前项目中的复用方式，不是“所有旧插件零修改”的承诺。

| 旧插件逻辑 | 迁移时怎样判断 |
| --- | --- |
| 本例的 `buildStart`、`transform`、`generateBundle` 与 `emitFile` / `getFileName` | 函数体直接复用，由适配层补充 Vite 接入策略，并用上述产物断言验收 |
| `resolveId`、`load`、普通 `transform` | 通常可以保留核心思路，但要核对模块 ID、query、虚拟模块约定、sourcemap 和插件顺序 |
| `renderChunk`、`generateBundle`、`writeBundle` 等产物钩子 | 必须检查 `bundle` 结构、执行时机、最终命名和写盘语义，不能只看钩子名称相同 |
| 依赖 Rollup 内部对象、罕见参数或特定 output 边角行为 | 不能假设兼容；应固定目标 Vite/Rolldown 版本并做针对性构建测试 |
| webpack compiler、loader、compilation 等专有对象 | 不属于 Rollup 插件契约，需要按 Vite 的模块、构建或 dev-server 生命周期重新设计 |

Vite 8 的构建底层是 Rolldown。它保留大量 Rollup 插件契约，但“接口同名”不等于执行细节、缓存、watch 和所有 output 行为都完全一致。迁移验收应检查真实产物与执行次数，而不只是检查构建进程是否退出成功。

::: details 生产级迁移还需补齐

1. **作用域与路径**：把单个 `FIXTURE_ENTRY` 换成明确的 include/exclude，统一不同平台的路径分隔符，并按需处理模块 ID 的 query；不要默认转换整个 `src/`。
2. **语法与 sourcemap**：本例只替换受控文本并返回 `map: null`。任意 JS/TS 语法改写应使用合适的 AST/token 工具，并生成正确映射。
3. **多次与并行构建**：状态应限定在插件实例或单次构建上下文中。除了保留 `buildStart` 的计数重置，还要验证 watch、多配置和并行构建不会共享污染 referenceId 或计数。
4. **额外输入与缓存**：如果真实插件读取其他文件，应建立相应 watch 依赖并验证缓存失效；本例没有额外实现这套能力。
5. **版本与顺序矩阵**：固定声明支持的 Vite/Rolldown 版本，验证单次 build、watch build、dev 不执行，以及与其他转换、产物插件组合时的顺序。
6. **元数据契约**：为下游消费者稳定定义六个字段的 schema；若用于发布完整性，还应另行设计校验、失败策略和必要的内容摘要，而不是扩张本例未实现的承诺。

:::

::: details 常见坑

- **把精确匹配改成 `id.includes('legacy-entry')`**：同名模块也可能被命中。本例故意只认领一个绝对路径。
- **把 `untouched.ts` 中出现旧标记当成失败**：它正是负向对照；同一份 chunk 必须保留一个原始占位符。
- **在元数据里硬编码 chunk 文件名**：hash 和命名配置都会变化，应通过 `getFileName(referenceId)` 获取真实 `output`。
- **在 `transform` 中直接写最终 JSON**：此时最终 chunk 文件名尚未确定，也绕过了产物管线；本例在 `generateBundle` 中登记 asset。
- **以为 `emitFile(type: 'chunk')` 会让页面自动加载它**：这里只是增加独立构建入口，应用没有 import 这个 fixture，也没有为它添加路由。
- **忘记每次构建重置 `replacements`**：watch 重建可能把旧计数带入新元数据。
- **在 dev 中寻找构建产物**：适配层设置了 `apply: 'build'`，而 dev 也没有这里要验收的最终 bundle。
- **把 Rollup 兼容扩大成 webpack 兼容或 Rolldown 完全等价**：适配层只复用本例列出的能力，其他行为必须单独验证。

:::

插件钩子基础与执行顺序可回看 [ch10 Vite 插件机制](../../guide/ch10-plugins.md)。
