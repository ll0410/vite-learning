# 23. 复用老工具链中的 Rollup 兼容逻辑

## 真实迁移场景

一个内部 Rollup 插件已经在多个构建任务中稳定运行：它把指定模块里的发布占位标记替换为公开值，再生成一份 JSON，记录替换次数和最终产物位置。应用迁到 Vite 后，这段逻辑不应因为外层工具变化而重写。

本例保留框架无关的 `transform` 和 `generateBundle`，只用很薄的适配层补充 Vite 的执行模式。为了避免把目录里所有同名标记都改掉，转换范围被限定到一个 fixture：

- `legacy-entry.ts` 是明确授权迁移的模块，标记应被替换。
- 它导入的 `untouched.ts` 含有相同标记，但不在授权范围内，标记必须保留。
- `legacy-rollup-migration.json` 记录源文件、真实 chunk 文件名、替换前后标记和替换次数。

**本项不提供 dev 页面示例。** 教学目标是构建钩子的平移和产物断言；`generateBundle` 消费的 bundle 在 dev 下并不存在。额外做页面只会偏离验证目标，因此 fixture 由 Rollup 的 `buildStart + emitFile` 注册为独立构建入口，不新增路由或页面。

## 钩子与数据流

```text
buildStart
  └─ emitFile(type: 'chunk') 注册受控 fixture，保存 referenceId
       ↓
transform(code, id)
  ├─ id !== 授权入口：返回 undefined，把模块原样交给后续插件
  └─ id === 授权入口：替换标记，返回 { code, map: null }
       ↓
打包、压缩、生成带 hash 的 chunk 文件名
       ↓
generateBundle
  ├─ getFileName(referenceId) 取得真实 chunk 文件名
  └─ emitFile(type: 'asset') 写出 legacy-rollup-migration.json
```

这里有两个值得直接复用的 Rollup 上下文能力：

- `this.emitFile`：向本次构建登记 chunk 或 asset，而不是自己拼接写盘路径。
- `this.getFileName`：把登记时得到的 reference ID 映射为最终文件名，避免元数据猜错 hash。

`buildStart` 在本例中只是搭建可独立验收的构建输入；旧插件真正需要迁移的业务逻辑位于 `transform` 与 `generateBundle`。fixture 用一次显式的 `Object.assign` 副作用保留两个标记，避免额外入口被 tree-shaking 成空 chunk；该 chunk 不会被页面加载。

## 最小实现

源码位于仓库根目录的 `plugins/migration/legacy-rollup.ts`。核心转换只处理一个规范化后的绝对路径：

```ts
transform(code, id) {
  if (id !== FIXTURE_ENTRY) return

  const segments = code.split(PLACEHOLDER)
  replacements = segments.length - 1
  if (replacements === 0) return

  return { code: segments.join(REPLACEMENT), map: null }
}
```

`generateBundle` 根据 reference ID 找到真实产物，再登记元数据 asset：

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

旧式核心对象没有 Vite 专属钩子。接入时只补名称和 `apply`：

```ts
export function legacyRollupPlugin(): Plugin {
  return {
    ...createLegacyRollupPlugin(),
    name: 'lab:legacy-rollup',
    apply: 'build',
  }
}
```

`apply: 'build'` 是 Vite 适配声明，不是对 webpack 生命周期的模拟。本实现也不尝试兼容 webpack loader 或 Tapable。

## 配置接入

共享配置已经展开 `migrationPlugins()`，本分类入口只需注册适配后的插件：

```ts
// plugins/migration/index.ts
import type { Plugin } from 'vite'
import { legacyRollupPlugin } from './legacy-rollup.ts'

export function migrationPlugins(): Plugin[] {
  return [legacyRollupPlugin()]
}
```

如果接入一个没有共享骨架的普通 Vite 项目，等价配置是：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { legacyRollupPlugin } from './plugins/migration/legacy-rollup'

export default defineConfig({
  plugins: [legacyRollupPlugin()],
})
```

不需要新增依赖，也不需要修改 Vue 应用入口。

## 可执行构建验证

在仓库根目录执行：

```bash
pnpm build
```

然后运行下面的断言。它不仅检查“出现了新值”，还同时验证限定范围、替换次数和元数据引用的产物真实性：

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

基础回归与文档检查：

```bash
pnpm docs:build
git diff --check
```

若需要手工观察，先读取 `dist/legacy-rollup-migration.json`，再打开其中的 `output` 文件。不要硬编码 chunk hash。

## 哪些 Rollup 能力可以复用

以下能力只描述模块图和构建产物，通常可以原样平移或只做很小调整：

| 能力 | 在 Vite 中的位置 | 迁移检查点 |
| --- | --- | --- |
| `resolveId` / `load` | 模块解析与加载 | 虚拟模块 ID、`\0` 约定、绝对路径是否正确 |
| `transform` | 模块转换 | `id` 过滤、返回格式、sourcemap、插件顺序 |
| `buildStart` / `buildEnd` | 构建生命周期 | 状态是否按每次构建重置，错误是否按预期传播 |
| `renderChunk` | chunk 写盘前处理 | 是否依赖 Rollup 特有的 chunk 内部结构 |
| `generateBundle` / `writeBundle` | 产物生成与写盘 | `bundle` 结构、`emitFile`、执行顺序和写盘时机 |
| `closeBundle` | 构建收尾 | watch 模式下是否可能执行多次 |
| `emitFile` / `getFileName` / `addWatchFile` | 插件上下文 | 最终文件名、额外输入和 watch 失效是否符合预期 |

Vite 8 的构建底层是 Rolldown。它保留大量 Rollup 插件契约，但“接口同名”不等于所有边角行为都完全一致。旧插件如果依赖 Rollup 内部对象、罕见 hook 参数或复杂 output 选项，必须用当前 Vite/Rolldown 版本做针对性构建测试。

## 哪些 webpack 专用能力必须重写

不能把下面的 API 包进同名函数就宣称兼容。它们属于另一套生命周期和对象模型：

| webpack 专用能力 | 为什么不能直接复用 | Vite 中的重写方向 |
| --- | --- | --- |
| `compiler.hooks.*`、Tapable 回调/promise 插件 | 生命周期由 webpack compiler 驱动 | 映射到 Vite/Rollup 构建钩子；dev 能力使用 Vite 服务器钩子 |
| loader 的 `this.callback`、`this.async`、pitching loader、loader request | loader 链和上下文不是 Rollup 模块转换协议 | 改成纯函数式 `load` / `transform`，显式传递输入与选项 |
| `compilation`、`chunkGraph`、webpack 内部 module 类型 | 对象结构和写产物方式均为 webpack 私有契约 | 在 `generateBundle` 消费公开 bundle，或使用 Vite 暴露的模块图 |
| `html-webpack-plugin` 的模板与钩子 | 它依赖 webpack compilation | 用 Vite `transformIndexHtml` 或标准 HTML 入口 |
| webpack-dev-server / webpack-dev-middleware  hooks | dev 服务器和中间件接入点不同 | 用 `configureServer`、`server.proxy` 或 `configurePreviewServer` |
| `NormalModuleReplacementPlugin`、`ProvidePlugin` 等 webpack 内置插件语义 | 解析、替换和注入发生在 webpack 自有管线 | 优先使用 `resolve.alias`、`define`；不足时再写 `resolveId` / `transform` |

因此，真实迁移应拆成两层：**保留只操作源码、模块 ID、bundle 的纯逻辑；重写所有依赖 webpack compiler、loader 和 dev-server 的外壳。**

## 生产级实现还需补齐

1. **作用域配置**：把单个 `FIXTURE_ENTRY` 换成明确的 include/exclude，统一 Windows 路径分隔符，并按需剥离 `id` 的 query；不要默认处理整个 `src/`。
2. **可靠转换与 sourcemap**：本例只替换受控文本标记并返回 `map: null`。任意 JS/TS 语法改写应使用 AST/token 工具，并生成 sourcemap。
3. **并发与多次构建**：把状态保存在插件实例或单次构建上下文中，避免 watch、多配置并行构建相互覆盖计数和 reference ID。
4. **缓存与 watch**：输入来自额外文件时，用 `addWatchFile` 建立依赖，并验证修改后缓存失效和重建次数。
5. **兼容性测试矩阵**：固定声明过的 Vite/Rolldown 版本，分别验证 dev 不执行、单次 build、watch build，以及和其他产物插件的顺序。
6. **元数据契约**：为下游消费者定义稳定 schema；涉及发布完整性时，再补充最终内容 hash、文件大小和失败时的构建退出策略。

## 常见坑

- **用 `id.includes('legacy-entry')` 扩大匹配范围**：可能误改同名模块。本例故意用规范化绝对路径精确匹配。
- **在元数据里手写 `assets/legacy-rollup-fixture.js`**：真实文件名可能带 hash，也可能受 `assetFileNames` / `chunkFileNames` 影响；应使用 `getFileName`。
- **在 `transform` 中直接写文件**：此时最终 chunk 和 hash 尚未确定，也绕过了 bundle 管线。额外产物应在 `generateBundle` 用 `emitFile` 登记。
- **把 `map: null` 当成生产通用方案**：它能满足最小教学断言，但不会为改写生成映射。
- **认为 Rollup 兼容就等于 webpack 兼容**：Tapable、loader 上下文和 compilation 不会因 Vite 支持 `transform` 而自动存在。
- **忽略 Vite 8 的 Rolldown 差异**：旧插件可以运行后仍要核对产物内容、执行次数和 output 配置，而不只是看进程退出码。

## 验证清单

- [ ] `legacy-entry.ts` 中的占位标记被替换成 `reused-legacy-rollup-value`。
- [ ] 未授权的 `untouched.ts` 在同一个产物中仍保留一个原标记。
- [ ] `legacy-rollup-migration.json` 的 `source`、`replacement` 和 `replacements` 正确。
- [ ] `metadata.output` 指向真实存在的构建 chunk，而不是猜测的文件名。
- [ ] `pnpm build`、`pnpm docs:build`、`git diff --check` 均通过。
- [ ] dev 下没有为此项新增页面、路由或对 webpack 专有 API 的模拟。

钩子基础与执行顺序可回看 [ch10 Vite 插件机制](../../guide/ch10-plugins.md)。
