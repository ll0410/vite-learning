# 08 生产配置替换与条件编译

> 对应源码：`plugins/code-transform/conditional-build.ts` 与 `src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts`。

## 真实场景

同一份受控源码需要在生产构建中写入公开服务源、打开公开实验开关，并完全删除只在开发期存在的诊断代码。本例通过 build-only 转换完成两个公开占位符替换和成对 `DEV_ONLY` 块删除，dev 则保留原始值与诊断块作为对照。

占位符和替换值都只能包含公开 URL、公开布尔开关。**不能把私密配置打包**：产物、sourcemap、压缩文件都可能被下载和检索，秘密必须留在服务端。

## 核心钩子与数据流

- `apply: 'build'`：dev 不运行替换或删除，保证对照输入可读。
- `enforce: 'pre'`：在 TypeScript 转译和压缩前处理接近源码的文本。
- `transform`：仅接受以 `/src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts` 结尾的模块 id。

处理顺序如下：

1. 逐行识别 `// DEV_ONLY:start` 和 `// DEV_ONLY:end`，丢弃标记及其中内容。
2. 把 `__LAB_PUBLIC_API_ORIGIN__` 替换为 `https://public-api.example.com`。
3. 把 `__LAB_PUBLIC_LABS_ENABLED__` 替换为文本 `true`。
4. 返回 `{ code: transformed, map: null }`，继续正常构建管线。

fixture 中布尔表达式是 `'__LAB_PUBLIC_LABS_ENABLED__' === 'true'`。dev 下左右不等，因此开关为 `false`；替换后左右相等，生产开关为 `true`，压缩产物通常进一步折叠成 `!0`。这种写法让占位输入本身仍是合法、可执行的 dev 模块。

## 配置接入

```ts
import { conditionalBuildPlugin } from './conditional-build.ts'

export function codeTransformPlugins(): Plugin[] {
  return [
    stripDebugPlugin(),
    injectTrackingPlugin(),
    tenantBuildPlugin(),
    conditionalBuildPlugin(),
  ]
}
```

分类数组已由共享配置展开。配置相关导入保留 `.ts` 后缀，不需要也不允许为本例修改共享 `vite.config.ts`。分类页只副作用导入 fixture，让受控模块进入构建图，不把占位符文本重复写进页面组件。

## 验证步骤

### 1. dev 对照

```bash
pnpm exec vite --port 5212
node --input-type=module -e "const source = await (await fetch('http://localhost:5212/src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts')).text(); for (const token of ['__LAB_PUBLIC_API_ORIGIN__', '__LAB_PUBLIC_LABS_ENABLED__', 'CONDITIONAL_BUILD_DEV_ONLY_SENTINEL']) { if (!source.includes(token)) throw new Error('dev 缺少 ' + token); } console.log('dev 对照断言通过');"
```

本项**不提供 dev 页面效果示例**：验证目标就是 dev/prod 差异，而不是让 dev 页面提前呈现生产配置。分类页仅解释原因并链接指南；dev 直接读取模块证明占位符和 DEV_ONLY 诊断能力仍保留。

### 2. build 产物断言

```bash
pnpm build
node --input-type=module -e "import { readdirSync, readFileSync } from 'node:fs'; const output = readdirSync('dist/assets').filter((file) => file.endsWith('.js')).map((file) => readFileSync('dist/assets/' + file, 'utf8')).join('\n'); for (const token of ['__LAB_PUBLIC_API_ORIGIN__', '__LAB_PUBLIC_LABS_ENABLED__', 'CONDITIONAL_BUILD_DEV_ONLY_SENTINEL']) { if (output.includes(token)) throw new Error('产物仍包含 ' + token); } if (!output.includes('https://public-api.example.com')) throw new Error('缺少公开生产 URL'); if (!/labsEnabled:\s*(?:true|!0)/.test(output)) throw new Error('公开布尔开关未启用'); console.log('conditional-build 产物断言通过');"
```

再执行 `pnpm docs:build` 和 `git diff --check`。断言应针对唯一哨兵，不要只搜索泛化的 `DEV_ONLY` 文本，因为指南入口或说明文字可能合法提到这个概念。

## 生产级实现还需补齐

- 使用 AST 或经过验证的替换工具处理任意表达式、注释和字符串边界，并生成 sourcemap；当前逐行/字符串方案只服务受控 fixture。
- 对公开 URL 使用 URL 校验，对布尔值和标记配对做 schema/语法校验，失败时终止构建。
- 为不同环境提供可审计的配置来源和产物检查，同时扫描秘密；不能把“占位符已替换”误当成完整安全配置。
- 明确 DEV_ONLY 块内副作用的语义：如果生产逻辑依赖它，删除后应通过测试发现问题，而不是悄悄改变行为。

## 常见坑

- **dev 也执行替换**：会失去对照，并可能让本地请求误到生产公开 URL；必须使用 `apply: 'build'`。
- **占位符替换了页面文本而非模块**：本例只处理目标 fixture，其他模块不受影响。
- **把未加引号的标识符占位符直接交给 dev**：会产生未定义变量；本例用字符串比较保持 dev 合法。
- **把私密 URL、token 或密码当公开配置**：只要进入浏览器产物就应视为公开，禁止写入。
- **未闭合 DEV_ONLY 标记**：当前受控方案会删除到文件末尾；生产实现必须校验配对并报错。
