# 05 移除 console / debugger / 测试代码

> 对应源码：仓库根目录的 `plugins/strip-debug.ts`。这是 [ch10 基础示例](../../guide/ch10-plugins.md) 的受控增强版。

## 真实场景

生产包通常不应包含教学调试输出、无意留下的 `debugger` 或只在测试源码中有意义的辅助块。本例在**指定 fixture** 中演示三类裁剪，同时保留 ch10 对 `src/` 下单行 `console.debug` 的原有断言。

本例不是通用的 JavaScript 压缩器，也不会处理项目里的任意 `console`。

## 核心钩子与数据流

- `apply: 'build'`：dev 不注册转换，调试能力保持原样。
- `enforce: 'pre'`：在 Vue/TypeScript 转译前读取接近原始源码的内容。
- `transform(code, id)`：先限定 `src/`，再区分 ch10 源码和 `src/plugin-lab/fixtures/code-transform/` 受控输入。

受控 fixture 的数据流是：逐行读取 → 删除完整单行 `console.log/info/warn/error/debug` → 删除独立 `debugger` 行 → 在成对的 `// test-only:start` 与 `// test-only:end` 之间丢弃所有行 → 返回 `{ code, map: null }`。

## 最小实现与配置接入

`stripDebugPlugin()` 已在 `plugins/code-transform/index.ts` 的分类插件数组中注册，共享 `vite.config.ts` 会展开该数组，无需另改配置：

```ts
export function codeTransformPlugins(): Plugin[] {
  return [stripDebugPlugin()]
}
```

受控输入位于 `src/plugin-lab/fixtures/code-transform/strip-debug-fixture.ts`，由代码改写分类页副作用导入，确保它进入构建模块图。`STRIP_DEBUG_DEV_SENTINEL` 是应保留的普通导出，三个裁剪哨兵分别用于 console、debugger 和 test-only 断言。

## 验证步骤

### 1. dev 对照：确认没有裁剪

```bash
pnpm exec vite --port 5212
curl http://localhost:5212/src/plugin-lab/fixtures/code-transform/strip-debug-fixture.ts
```

响应应仍包含 `STRIP_DEBUG_CONSOLE_SENTINEL`、`debugger` 和 `STRIP_DEBUG_TEST_ONLY_SENTINEL`。本项**不提供 dev 页面效果示例**，因为验证目标恰恰是 `apply: 'build'` 让 dev 不变；分类页只提供说明和指南入口。

### 2. build：确认裁剪且保留普通代码

```bash
pnpm build
node --input-type=module -e "import { readdirSync, readFileSync } from 'node:fs'; const files = readdirSync('dist/assets').filter((file) => file.endsWith('.js')); const output = files.map((file) => readFileSync('dist/assets/' + file, 'utf8')).join('\n'); for (const token of ['STRIP_DEBUG_CONSOLE_SENTINEL', 'STRIP_DEBUG_DEBUGGER_SENTINEL', 'STRIP_DEBUG_TEST_ONLY_SENTINEL']) { if (output.includes(token)) throw new Error('仍包含 ' + token); } if (/console\\.debug\\s*\\(/.test(output)) throw new Error('ch10 console.debug 断言失败'); if (!output.includes('STRIP_DEBUG_DEV_SENTINEL')) throw new Error('普通导出被误删'); console.log('strip-debug 产物断言通过');"
```

同时运行 `pnpm docs:build` 验证指南导航，并用 `git diff --check` 检查补丁格式。

## 生产级实现还需补齐

- 使用 ESTree/Babel/Oxc 等 AST 识别表达式语句、作用域和调用形式，并生成 sourcemap；不要扩大这里的逐行正则。
- 明确允许删除的 console 方法、保留错误上报的策略，以及测试块的依赖分析和语法校验。
- 对跨行调用、模板字符串、注释和字符串里的相似文本增加测试；当前实现只接受受控单行语法，标记也必须成对且独占一行。
- `map: null` 表示不提供转换 sourcemap，适合最小教学但不适合复杂生产转换。

## 常见坑

- **期待 dev 页面删除语句**：`apply: 'build'` 故意阻止这一行为。
- **匹配整个项目所有 console**：容易误删监控、错误处理；本例把扩展能力限制在 fixture。
- **只删开始标记未处理结束标记**：受控输入必须成对；生产实现应在解析失败时让构建明确失败。
- **把字符串里的 `debugger` 当成语句**：产物断言中的 `debugger` 词用于受控示例，真实项目应基于 AST 检查语句节点。
