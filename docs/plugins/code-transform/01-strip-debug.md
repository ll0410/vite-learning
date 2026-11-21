# 05 移除 console / debugger / 测试代码

开发时保留 `console`、`debugger` 和诊断代码很方便，但发布前往往需要有选择地清理它们。难点不只是“让语句消失”，还要说清楚**删的是哪个文件、哪一类语句，以及哪些普通代码必须留下**。

本例用一份固定输入回答这些问题。它不是通用的 JavaScript 压缩器，也不会处理项目里的任意 `console`：普通 `src/` 模块只延续 ch10 的单行 `console.debug` 清理；更完整的 console、`debugger` 和测试块裁剪只发生在受控 fixture 中。

> 对应源码：仓库根目录的 `plugins/strip-debug.ts`。这是 [ch10 基础示例](../../guide/ch10-plugins.md) 的受控增强版。

## 先看懂：从一份 fixture 到生产 chunk

一句话概括：**fixture 是输入，`transform` 返回删减后的源码，分类页通过导入让它进入构建，最后检查路由产物中哪些哨兵消失、哪些普通代码仍在。**

这里的 **fixture** 是为了观察转换而准备的固定示例文件；**哨兵**是源码中特意放入、便于搜索和断言的字符串。它们不影响业务界面，却能准确标记一条语句有没有进入产物。**chunk** 则指构建后生成的一份 JavaScript 文件；本例的分类页会懒加载自己的 chunk。

```text
strip-debug-fixture.ts（固定输入）
        ↓ build 时执行 transform
只保留普通导出与 globalThis 赋值
        ↓
CodeTransformDemos.vue 副作用导入 fixture
        ↓
/plugins/code-transform 对应的生产 chunk
        ↓
三个调试哨兵消失，STRIP_DEBUG_DEV_SENTINEL 保留
```

dev 是对照组：插件声明了 `apply: 'build'`，所以同一份 fixture 在开发服务器中不经过这次裁剪。

## 完整链路：输入、转换、消费与结果

### 1. 输入：一份包含三类调试代码的 fixture

`src/plugin-lab/fixtures/code-transform/strip-debug-fixture.ts` 的完整内容如下：

```ts
// 只供 strip-debug 教学断言使用；dev 中保留全部语句。
console.log('STRIP_DEBUG_CONSOLE_SENTINEL')
debugger // STRIP_DEBUG_DEBUGGER_SENTINEL

// test-only:start
console.warn('STRIP_DEBUG_TEST_ONLY_SENTINEL')
// test-only:end

export const stripDebugDevSentinel = 'STRIP_DEBUG_DEV_SENTINEL'
Object.assign(globalThis, { stripDebugDevSentinel })
```

前三个哨兵分别观察 console、`debugger` 和显式测试块。`STRIP_DEBUG_DEV_SENTINEL` 则是反向对照：它所在的普通导出和 `Object.assign` 都不是清理目标，生产构建后必须仍能观察到这个值。

这里的“测试代码”不是插件自动猜出来的测试文件，也不是所有 `console.warn`，而只是 `// test-only:start` 与 `// test-only:end` 明确围住的行。

### 2. 转换结果：三个清理目标消失，普通代码留下

对上面的输入执行真实 `stripDebugPlugin().transform`，返回的 `code` 核心内容如下。**为便于阅读，这里只省略了仍被保留的顶部注释和空行，可执行代码没有改写：**

```ts
export const stripDebugDevSentinel = 'STRIP_DEBUG_DEV_SENTINEL'
Object.assign(globalThis, { stripDebugDevSentinel })
```

具体发生了三件事：

1. 完整的单行 `console.log(...)` 被删除，因此 `STRIP_DEBUG_CONSOLE_SENTINEL` 随语句一起消失。
2. 独立的 `debugger` 行被删除，行尾注释中的 `STRIP_DEBUG_DEBUGGER_SENTINEL` 也一起消失。
3. 两个 `test-only` 标记及其中所有行都被删除，因此标记内的 `console.warn(...)` 不再单独参与匹配。

这时得到的仍是转换后的模块源码，不是最终压缩产物。后续构建还会进行模块打包、压缩和常量内联。

### 3. 消费者：分类页用副作用导入把 fixture 带进构建

`src/views/plugins/categories/CodeTransformDemos.vue` 的 `<script setup>` 中有下面这条真实导入：

```ts
import '@/plugin-lab/fixtures/code-transform/strip-debug-fixture'
```

这种不写导入名称的写法叫**副作用导入**：目的不是取得 `stripDebugDevSentinel` 并在模板中使用，而是让模块加载时执行顶层代码。对构建工具来说，这条 import 也让 fixture 成为分类页的依赖，否则它不会出现在本次模块处理链路中。

fixture 又通过 `Object.assign(globalThis, { stripDebugDevSentinel })` 把普通值挂到浏览器的全局对象上，给产物断言和预览页面留下一个可观察结果。页面本身并不读取它做渲染。

分类页路由位于 `src/plugin-lab/routes/code-transform.ts`：

```ts
{
  path: '/plugins/code-transform',
  name: 'plugin-lab-code-transform',
  component: () => import('@/views/plugins/categories/CodeTransformDemos.vue'),
}
```

动态 import 让构建结果为分类页生成单独的 `CodeTransformDemos-<hash>.js`，fixture 保留下来的副作用也进入这个 chunk。

### 4. 页面与构建结果：页面负责说明，产物负责证明

`/plugins/code-transform#strip-debug` 展示的是构建专用示例的说明和指南入口，**没有把输入、输出做成 dev 动态效果**。这是有意设计：dev 必须保留原代码，真正的裁剪结果应检查生产 chunk。

当前生产 chunk 中保留下来的相关语句是：

```js
Object.assign(globalThis,{stripDebugDevSentinel:`STRIP_DEBUG_DEV_SENTINEL`});
```

以上只从压缩后的 chunk 中摘出这一条语句，周边代码省略；文件 hash、引号形式和压缩格式可能随构建变化。最终看不到 `export const stripDebugDevSentinel` 是打包器省略无用导出并内联常量的结果，不是 strip-debug 把普通导出误删了。验证时应关注 `STRIP_DEBUG_DEV_SENTINEL` 仍然存在，而下面三个调试哨兵均不存在：

- `STRIP_DEBUG_CONSOLE_SENTINEL`
- `STRIP_DEBUG_DEBUGGER_SENTINEL`
- `STRIP_DEBUG_TEST_ONLY_SENTINEL`

## 核心原理：先看结果，再回头看钩子

“钩子”是 Vite 在特定阶段调用的插件函数。本例只需理解两个配置项和一个模块转换钩子。

### `apply: 'build'`：只在生产构建注册转换

`vite` 开发服务器对应 `serve`，`vite build` 对应 `build`。插件声明：

```ts
apply: 'build'
```

因此 dev 中不会执行这里的 `transform`，Inspect 也不应出现 `lab:strip-debug` 的 dev 转换记录。`vite preview` 同样不会重新运行插件，它只是托管之前已经生成的生产产物。

### `enforce: 'pre'`：在 Vue/TypeScript 转译前处理

插件声明：

```ts
enforce: 'pre'
```

这样能在 Vue/TypeScript 转译以及最终压缩之前处理更接近原始源码的内容，避免调试语句先被编译成其他形式。它控制的是插件在转换管线中的位置，并不意味着可以绕过后面的所有构建步骤。

### `transform(code, id)`：读取源码，按模块范围返回新源码

`code` 是当前模块的源码字符串，`id` 是当前模块标识，通常是带仓库绝对路径的文件路径，也可能带查询参数。插件先用 `id` 限定范围，关键判断与真实源码一致：

```ts
if (!id.includes('/src/')) return

const isControlledFixture = id.includes(controlledFixtureRoot)
if (!isControlledFixture && !code.includes('console.debug')) return
```

其中：

```ts
const controlledFixtureRoot = '/src/plugin-lab/fixtures/code-transform/'
```

这两层范围不能混为一谈：

| 模块范围 | 本例实际处理规则 |
| --- | --- |
| `/src/` 之外 | 直接返回，不处理依赖包、根目录配置文件等模块 |
| 受控 fixture 目录之外的 `/src/` 模块 | 没有 `console.debug` 就提前返回；有则只删除完整的单行 `console.debug(...)` |
| `/src/plugin-lab/fixtures/code-transform/` 中的 fixture | 继续检查其他规则，删除受支持的单行 console、独立 `debugger` 和 `test-only` 块 |

例如 `src/main.ts` 中的下面这行会在 build 时被删除，但周边 import、应用创建和挂载代码都保留：

```ts
console.debug('[boot]', bootNote)
```

`src/hmr-demo/no-accept.ts` 和 `src/hmr-demo/counter.ts` 中的单行 `console.debug` 也遵循同一规则。普通模块里的 `console.log/info/warn/error` 不会因为 fixture 支持这些方法就被一并删除。

受控 fixture 不能在“没有 `console.debug`”时提前返回，因为其中还可能只有 `console.log`、`debugger` 或测试标记。

### 逐行清理的顺序与返回约定

`transform` 内部按换行拆分源码，并依照下面的顺序过滤：

1. 遇到独占一行的 `// test-only:start`，进入测试块并删除标记。
2. 遇到独占一行的 `// test-only:end`，离开测试块并删除标记。
3. 位于测试块中的行全部删除，不区分它是不是 console。
4. 其余行再匹配 console 和 `debugger`：fixture 支持 `log/info/warn/error/debug`，普通模块只支持 `debug`；`debugger` 可以带分号和行尾注释。
5. 重新拼接剩余行，只有确实发生变化才返回新代码：

```ts
return changed ? { code: cleaned, map: null } : undefined
```

返回 `undefined` 表示“这个模块没有被本插件修改”，避免把未改动模块标记为已转换。这里的“单行”是字面限制：跨行调用、同一行还有别的语句、块内声明是否被外部依赖，都不是这套教学过滤器能够可靠处理的语法问题。

## 接入：注册插件，并确保输入进入模块图

`plugins/code-transform/index.ts` 中的 `codeTransformPlugins()` 已注册本例，真实返回数组为：

```ts
return [stripDebugPlugin(), injectTrackingPlugin(), tenantBuildPlugin(), conditionalBuildPlugin()]
```

共享 `vite.config.ts` 在 `plugins` 数组中展开分类插件：

```ts
...codeTransformPlugins(),
```

因此本例无需另改配置。数组体现注册顺序，实际执行先后还要结合各插件的 `enforce` 和钩子阶段判断。

接入包含两个缺一不可的动作：插件注册后才有转换能力，分类页的副作用导入则保证这份 fixture 进入模块图。前者不会自动扫描磁盘上所有文件，后者也不会在 dev 中绕过 `apply: 'build'`。

## 验证步骤

### 1. dev 对照：确认原语句和调试能力都保留

启动开发服务器：

```bash
pnpm exec vite --port 5212
```

在另一个终端请求 fixture：

```bash
curl http://localhost:5212/src/plugin-lab/fixtures/code-transform/strip-debug-fixture.ts
```

**预期结果：**响应仍包含 `console.log('STRIP_DEBUG_CONSOLE_SENTINEL')`、带 `STRIP_DEBUG_DEBUGGER_SENTINEL` 注释的 `debugger`、成对的 `test-only` 标记、`STRIP_DEBUG_TEST_ONLY_SENTINEL`，以及普通的 `STRIP_DEBUG_DEV_SENTINEL`。这证明 dev 没有提前执行生产裁剪。

访问 `http://localhost:5212/plugins/code-transform#strip-debug`，应看到“构建专用、dev 保留调试语句”的说明，而不是一份声称已经清理过的页面。由于分类页确实执行了 fixture，浏览器控制台仍会看到两个调试哨兵的 log/warn；`debugger` 是否暂停取决于 DevTools 状态，不作为自动断言依据。

### 2. build：同时断言“应删的消失”和“应留的保留”

```bash
pnpm build
node --input-type=module <<'NODE'
import { readdirSync, readFileSync } from 'node:fs'

const files = readdirSync('dist/assets').filter((file) => file.endsWith('.js'))
const output = files
  .map((file) => readFileSync('dist/assets/' + file, 'utf8'))
  .join('\n')

for (const token of [
  'STRIP_DEBUG_CONSOLE_SENTINEL',
  'STRIP_DEBUG_DEBUGGER_SENTINEL',
  'STRIP_DEBUG_TEST_ONLY_SENTINEL',
]) {
  if (output.includes(token)) throw new Error('仍包含 ' + token)
}

if (/console\.debug\s*\(/.test(output)) {
  throw new Error('ch10 console.debug 断言失败')
}
if (!output.includes('STRIP_DEBUG_DEV_SENTINEL')) {
  throw new Error('普通导出被误删')
}

console.log('strip-debug 产物断言通过')
NODE
```

**预期结果：**命令退出码为 0，最后输出：

```text
strip-debug 产物断言通过
```

三个哨兵检查分别对应 console、`debugger` 和测试块；普通哨兵检查防止“为了删除调试代码，把整份模块也删掉”；`console.debug` 正则则延续 ch10 对 `src/main.ts` 和 HMR 示例的回归断言。

这里的全产物扫描是当前项目的教学断言，不表示插件处理了 `node_modules`。如果未来某个依赖包合法包含 `console.debug`，应细化断言目标，而不是擅自把本插件的处理范围扩大到依赖包。

### 3. preview：确认保留代码在真实页面加载后仍可观察

```bash
pnpm exec vite preview --port 5312
```

访问 `http://localhost:5312/plugins/code-transform#strip-debug`。

**预期结果：**分类面板正常显示；控制台不再输出 `STRIP_DEBUG_CONSOLE_SENTINEL` 和 `STRIP_DEBUG_TEST_ONLY_SENTINEL`，也不会因该 fixture 的 `debugger` 暂停。在控制台执行：

```js
window.stripDebugDevSentinel
```

应返回：

```text
STRIP_DEBUG_DEV_SENTINEL
```

这说明调试语句被清理后，普通副作用仍随分类 chunk 加载并执行。控制台可能有应用的其他正常输出，不要把“控制台完全为空”当作本例目标。

## 进阶参考

::: details 生产级实现还需补齐

- **用语法结构代替逐行猜测。**AST（抽象语法树）是把源码解析成表达式、语句等节点的树形结构。生产实现应使用 Babel、Oxc 等 AST 工具识别表达式语句、调用形式和作用域，而不是扩大这里的逐行正则。
- **明确哪些代码允许删除。**需要配置 console 方法允许清单，并保留错误上报等必要能力。`console.log(sendMetrics())` 这类调用的参数可能有副作用，删掉整个语句不只是少一条日志。
- **为测试块建立语义和语法校验。**块内声明可能被块外引用，删除后可能改变依赖关系或直接产生语法错误。生产插件应分析依赖、验证标记配对与嵌套，并在输入不合法时让构建明确失败。
- **生成准确的 source map。**source map 是转换后代码与原始源码位置之间的映射。`map: null` 只表示本插件没有为删行后的代码提供映射，并不等于关闭整个项目的 sourcemap；教学 fixture 可以接受这一简化，生产转换应使用 MagicString 或 AST 工具保留映射。
- **覆盖真实语法边界。**至少测试跨行调用、模板字符串、注释和字符串里的相似文本、空块、未闭合/多余/嵌套标记，以及带副作用的参数。当前实现只接受受控单行语法，标记也必须独占一行。

:::

::: details 常见坑

- **期待 dev 页面或 Inspect 已经删除语句**：`apply: 'build'` 故意阻止这一行为；dev 原样保留正是对照结果，preview 也不会重新执行插件。
- **把“受控 fixture 支持五种 console”理解成“全项目都会删除五种 console”**：普通 `/src/` 模块仍只删除单行 `console.debug`，`/src/` 之外不处理。贸然扩大范围容易误删监控和错误处理。
- **开始或结束标记不成对**：当前教学实现不会报错。缺少结束标记时，从开始标记到文件末尾的内容都会被删除；多余的结束标记也会被直接移除。生产实现必须校验并终止非法转换。
- **把字符串或模板字符串里的 `debugger`、标记文本当成真实语句**：逐行文本无法可靠区分词法和语法位置；产物中的 `STRIP_DEBUG_DEBUGGER_SENTINEL` 也只是行尾注释哨兵，真实项目应检查 AST 语句节点。
- **在最终 chunk 中找不到 `export const`，就认定普通导出被误删**：打包器会省略未被外部使用的导出并内联常量。本例应断言全局赋值值 `STRIP_DEBUG_DEV_SENTINEL` 仍存在。
- **删掉分类页的副作用导入后仍期待看到 fixture 产物**：没有 import 就不会进入这条页面依赖链，插件即使已注册也没有这份输入可转换。
- **把 `map: null` 当成全局 sourcemap 开关**：它只描述本次插件返回值；项目是否生成 sourcemap 由构建配置决定，而转换插件是否有义务提供映射是另一件事。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
