# 07 多租户 / 多品牌差异化构建

> 对应源码：`plugins/code-transform/tenant-build.ts`；公开输入位于 `src/plugin-lab/fixtures/code-transform/tenants/`；页面消费方是 `src/views/plugins/categories/CodeTransformDemos.vue`。

同一套应用可能需要为不同客户显示不同品牌名、主题色和公开功能开关。这里的“租户”可以理解为一个客户或品牌。本例在每次开发服务启动或生产构建时选择一个租户，让同一份 Vue 源码使用不同的固定值；它不是打开页面后再运行时切换租户。

::: tip 现成方案速览
- **官方 / 成熟方案**：Vite 官方 [`mode`](https://vite.dev/guide/env-and-mode.html#modes)、`.env.[mode]`、`define`、`resolve.alias`、`build.outDir` 已覆盖单次差异化构建；多品牌矩阵的继承与批量编排属于项目脚本。
- **覆盖程度**：**部分覆盖**。
- **本例定位**：教学用最小实现，重点是理解 `mode` 如何驱动 `define` 常量，让同一份源码产出不同品牌结果。
- **值得自研的时机**：需要品牌继承、配置合并、批量构建矩阵时；不要为此引入维护状态不明的 0.x 插件。
:::

## 先看懂：配置怎样变成页面内容

一句话概括：**`TENANT` 和公开 JSON 是输入，`define` 中的四个编译期常量是插件输出，分类页消费的仍然是一个普通 JavaScript 对象。**

`define` 是 Vite 的配置项，用来给源码中的指定标识符提供固定值。“编译期常量”是指这些值在开发服务启动或构建时已经确定，不是浏览器打开页面后再读取 `process.env` 或请求租户接口。

```text
TENANT=beta（未设置时使用 default）
              ↓ Node.js 中的 config 钩子
      白名单校验并读取 beta.json
              ↓ 返回 define
四个标识符分别获得 ID、品牌、主题色和 Beta 开关
              ↓
  src/views/plugins/categories/CodeTransformDemos.vue
              ↓ 组装为本地 tenant 对象
   品牌与 ID 文本、主题色块、开关文字、Beta 面板
```

开发态和生产构建的最后一步有一点不同：

| 阶段 | Vite 如何提供这些值 | 可以观察到哪里 |
| --- | --- | --- |
| dev | 当前 Vite 8 通过 `/@vite/env` 在全局对象上定义值，业务模块中的标识符可以保留 | 开发页面、`/@vite/env` 响应 |
| build | 把标识符静态替换为对应的 JavaScript 字面量 | 生产 JS 产物、预览页面 |

两种方式的业务写法相同，值也都在本次启动或构建时固定。不要把 dev 的“提供全局值”误读成支持运行时换租户。

两份 JSON 都由 Node.js 的 `readFileSync` 读取，浏览器不会导入整份租户目录。不过，**选中的值最终会提供给浏览器，必须视为公开信息**；密码、私钥、token、私密接口地址和服务器专用配置都不能写进这些 JSON 或 `define`。

## 一个完整示例：从 Beta JSON 到品牌页面

### 1. 输入：选择 `beta.json`

在仓库根目录运行：

```bash
TENANT=beta pnpm exec vite --port 5212 --strictPort
```

`TENANT=beta` 只作用于这一次命令。插件因此读取 `src/plugin-lab/fixtures/code-transform/tenants/beta.json`，其完整内容是：

```json
{
  "brand": "Contoso Beta 教学品牌",
  "theme": "#7c2d12",
  "features": {
    "betaPanel": true
  }
}
```

如果不设置 `TENANT`，插件会读取同目录的 `default.json`，品牌为 `Northwind 默认教学品牌`，主题色为 `#14532d`，`betaPanel` 为 `false`。

### 2. 输出：四个标识符及其固定值

插件为这次启动生成下面的对应关系。表中的“`define` 文本”是配置里实际保存的字符串内容，也是生产替换时使用的 JavaScript 表达式：

| 业务源码中的标识符 | `define` 文本 | 表达式的类型与值 |
| --- | --- | --- |
| `__TENANT_ID__` | `"beta"` | 字符串 `beta` |
| `__TENANT_BRAND__` | `"Contoso Beta 教学品牌"` | 字符串 `Contoso Beta 教学品牌` |
| `__TENANT_THEME__` | `"#7c2d12"` | 字符串 `#7c2d12` |
| `__TENANT_BETA_PANEL__` | `true` | 布尔值 `true` |

字符串文本包含引号，布尔值文本则不包含引号。这个区别由实现中的 `JSON.stringify` 保证，后文会展开说明。

### 3. 消费：标识符组成本地 `tenant` 对象

分类页没有导入 JSON，也没有读取环境变量，而是直接使用四个标识符。以下摘录保留了完整的 `tenant` 对象，省略同文件中的其他示例：

```ts
const tenant = {
  id: __TENANT_ID__,
  brand: __TENANT_BRAND__,
  theme: __TENANT_THEME__,
  betaPanel: __TENANT_BETA_PANEL__,
}
```

生产构建完成静态替换后，这段对象的核心内容如下。这里为便于阅读整理了格式，并省略 Vue SFC 编译产生的其他代码：

```ts
const tenant = {
  id: "beta",
  brand: "Contoso Beta 教学品牌",
  theme: "#7c2d12",
  betaPanel: true,
}
```

磁盘上的 Vue 源文件不会被改写。dev 中也不要求请求到的 SFC 模块出现上述字面量：当前 Vite 8 会由 `/@vite/env` 提供这些全局定义，让保留标识符的模块正常工作。

### 4. 结果：模板显示 Beta 品牌与公开面板

打开 <http://localhost:5212/plugins/code-transform#tenant-build>，模板对 `tenant` 的消费会产生以下可观察结果：

| 页面绑定的值 | Beta 页面结果 |
| --- | --- |
| `tenant.id` | 显示租户 ID `beta`，面板的 `data-tenant` 也为 `beta` |
| `tenant.brand` | 标题显示 `Contoso Beta 教学品牌` |
| `tenant.theme` | 显示 `#7c2d12`，色块和面板顶部边框使用该颜色 |
| `tenant.betaPanel` | 显示“Beta 功能：开启”，`v-if` 成立，出现“Beta 专属公开功能面板” |

到这里，完整链路已经闭合：**环境变量选择 JSON，插件输出固定值，页面把它们组装成对象，模板负责展示。**

## 实现原理：`config` 钩子只做三件事

完整实现位于 `plugins/code-transform/tenant-build.ts`。下面摘录 `config` 钩子及其白名单，省略插件工厂外层、导入和 `TenantConfig` 接口；钩子内的逻辑与源码一致：

```ts
const tenantIds = new Set(['default', 'beta'])

config() {
  const tenantId = process.env.TENANT || 'default'
  if (!tenantIds.has(tenantId)) {
    throw new Error(`[lab:tenant-build] 未知租户 ${tenantId}；可选值：default、beta`)
  }

  const configUrl = new URL(
    `../../src/plugin-lab/fixtures/code-transform/tenants/${tenantId}.json`,
    import.meta.url,
  )
  const tenant = JSON.parse(readFileSync(configUrl, 'utf8')) as TenantConfig

  return {
    define: {
      __TENANT_ID__: JSON.stringify(tenantId),
      __TENANT_BRAND__: JSON.stringify(tenant.brand),
      __TENANT_THEME__: JSON.stringify(tenant.theme),
      __TENANT_BETA_PANEL__: JSON.stringify(tenant.features.betaPanel),
    },
  }
}
```

### 1. 在配置阶段确定租户

`config` 是 Vite 的配置钩子，会在最终配置解析前运行，返回的配置片段由 Vite 合并。本插件没有 `apply: 'build'` 限制，所以开发服务启动和生产构建都会执行它。

`process.env.TENANT || 'default'` 表示未设置或设置为空字符串时使用 `default`。白名单只接受精确的 `default`、`beta`；其他值会直接抛错，不会拼成文件路径。这既能提前发现发布参数错误，也避免利用 `../` 等输入读取任意路径。

JSON 只在钩子执行时读取。改变 `TENANT` 后需要重启开发服务；修改 JSON 后也应重启，确保验证的是新配置，而不是上一次启动时缓存的值。

### 2. 从受控路径读取公开 JSON

`import.meta.url` 是当前插件文件自身的 URL。以它为基准拼出 JSON 路径，不依赖执行命令时所在的工作目录。`readFileSync(configUrl, 'utf8')` 在 Node.js 侧同步读取文本，`JSON.parse` 再把它解析为对象。

这里的 `as TenantConfig` 只是 TypeScript 类型断言，不会在运行时检查 JSON。字段缺失、颜色格式错误或布尔值类型错误，仍需由更严格的校验机制处理。

### 3. 返回 `define`，让 Vite 提供固定值

`JSON.stringify` 把 JavaScript 值序列化成可安全嵌入代码的表达式：

- `JSON.stringify('beta')` 得到包含双引号的文本 `"beta"`，替换后仍是字符串；若直接写裸 `beta`，JavaScript 会把它当作变量名。
- `JSON.stringify(true)` 得到文本 `true`，替换后是布尔值；若使用文本 `"true"`，得到的反而会是字符串。
- 字符串中的引号、反斜杠等内容也会被正确转义，不需要手工拼接。

虽然本例归在“代码转换”分类，插件本身并没有 `transform` 钩子，也不操作 AST（源代码的抽象语法树结构）。它只负责返回 `define` 配置，具体 dev 定义和生产替换由 Vite 完成。业务代码不需要写 `process.env.TENANT`，也不需要主动从 `window` 读取这些值。

## 类型声明与配置接入

### 让 TypeScript 认识四个标识符

`src/types/code-transform.d.ts` 的完整声明如下：

```ts
declare const __TENANT_ID__: string
declare const __TENANT_BRAND__: string
declare const __TENANT_THEME__: string
declare const __TENANT_BETA_PANEL__: boolean
```

这些声明只用于类型检查，避免 TypeScript 把编译期标识符报告为未定义变量；它们不会生成运行时代码，也不会代替 `define` 提供实际值。`tsconfig.json` 已包含 `src/**/*.d.ts`，因此业务文件不需要导入这份声明。

### 插件已经注册，不需要另改共享配置

`plugins/code-transform/index.ts` 已导入并注册插件。以下摘录省略其他插件的导入：

```ts
import { tenantBuildPlugin } from './tenant-build.ts'

export function codeTransformPlugins(): Plugin[] {
  return [
    stripDebugPlugin(),
    injectTrackingPlugin(),
    tenantBuildPlugin(),
    conditionalBuildPlugin(),
  ]
}
```

它在本组插件中排第三。`vite.config.ts` 又通过 `...codeTransformPlugins()` 展开整个数组，因此示例开箱即用，无需再修改共享配置。由于本插件只实现 `config`，这个注册位置不代表它会对分类页执行一次手写的第三步源码转换。

## 验证步骤

### 1. 检查 Beta dev 的实际定义

保持前面 `TENANT=beta` 的开发服务运行，执行：

```bash
curl http://localhost:5212/@vite/env
```

预期响应中的 `defines` 对象包含下面的键和值。这里拆行展示，并省略 Vue 自带的其他定义：

```text
"__TENANT_BETA_PANEL__": true
"__TENANT_BRAND__": "Contoso Beta 教学品牌"
"__TENANT_ID__": "beta"
"__TENANT_THEME__": "#7c2d12"
```

页面则应根据前面的完整示例显示 Beta 品牌、主题和专属面板。若直接请求 `CodeTransformDemos.vue` 仍看到 `__TENANT_*__` 标识符，不代表插件失效；dev 的全局定义与 build 的文本替换不是同一种观察方式。

### 2. 检查默认 dev 页面

停止 Beta 服务，在没有额外设置 `TENANT` 的终端中运行：

```bash
pnpm exec vite --port 5212 --strictPort
```

打开 <http://localhost:5212/plugins/code-transform#tenant-build>，预期看到：

- 品牌 `Northwind 默认教学品牌`，租户 ID 为 `default`；
- 主题色 `#14532d` 及对应色块、顶部边框；
- “Beta 功能：关闭”，不显示 Beta 专属面板。

### 3. 检查默认生产产物

```bash
pnpm build
node --input-type=module <<'NODE'
import { readdirSync, readFileSync } from 'node:fs'

const output = readdirSync('dist/assets')
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync('dist/assets/' + file, 'utf8'))
  .join('\n')

for (const token of ['Northwind 默认教学品牌', '#14532d']) {
  if (!output.includes(token)) throw new Error('默认构建缺少 ' + token)
}
for (const token of ['Contoso Beta 教学品牌', '#7c2d12']) {
  if (output.includes(token)) throw new Error('默认构建混入 ' + token)
}
for (const token of ['__TENANT_ID__', '__TENANT_BRAND__', '__TENANT_THEME__', '__TENANT_BETA_PANEL__']) {
  if (output.includes(token)) throw new Error('生产构建仍包含 ' + token)
}
console.log('默认租户产物断言通过')
NODE
```

预期第二条命令输出 `默认租户产物断言通过`。这同时证明默认品牌与主题已进入产物、Beta 品牌与主题没有混入，并且四个标识符已完成生产替换。

### 4. 检查 Beta 独立构建与预览

```bash
TENANT=beta pnpm build --outDir dist-beta
node --input-type=module <<'NODE'
import { readdirSync, readFileSync } from 'node:fs'

const output = readdirSync('dist-beta/assets')
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync('dist-beta/assets/' + file, 'utf8'))
  .join('\n')

for (const token of ['Contoso Beta 教学品牌', '#7c2d12']) {
  if (!output.includes(token)) throw new Error('Beta 构建缺少 ' + token)
}
for (const token of ['Northwind 默认教学品牌', '#14532d']) {
  if (output.includes(token)) throw new Error('Beta 构建混入 ' + token)
}
console.log('Beta 租户产物断言通过')
NODE
pnpm exec vite preview --outDir dist-beta --port 4212 --strictPort
```

预期第二条命令输出 `Beta 租户产物断言通过`。随后打开 <http://localhost:4212/plugins/code-transform#tenant-build>，应看到 Beta 品牌、`#7c2d12`、开启的开关和 Beta 专属面板。

`dist` 与 `dist-beta` 分开保存两份证据，避免后一次构建覆盖前一次；产物目录不应提交。

### 5. 检查未知租户会立即失败

```bash
TENANT=gamma pnpm exec vite --port 5212 --strictPort
```

预期启动失败，错误信息包含：

```text
[lab:tenant-build] 未知租户 gamma；可选值：default、beta
```

插件不会把 `gamma` 继续拼入文件路径，也不会悄悄退回默认品牌。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 生产级实现还需补齐

- 用 schema 校验 JSON 的必填字段、颜色格式和开关类型。当前的 `TenantConfig` 类型断言不能替代运行时校验，未知租户之外的数据错误也需要明确诊断。
- 建立逐租户构建矩阵与产物发布映射，把 `TENANT`、独立 `outDir`、HTML 缓存策略和部署目标一起核对，避免环境变量串台或覆盖输出目录。
- 将品牌资源、路由可见性、服务端数据隔离和缓存键一起设计。前端 `define` 开关只控制展示，不能承担鉴权。
- 如果要求同一份产物在运行时换租户，应改用受控的运行时配置接口，并让页面响应配置变化；本例的启动/构建期固定值无法完成这件事。
- 如果需要在构建时删除整段功能源码，应另行设计条件编译（按条件保留或删除源码）并验证产物，不要把本例的模板条件渲染当成代码裁剪。

:::

::: details 常见坑

- **改完环境变量或 JSON 却不重启**：配置钩子不会在每次页面请求时重新选择租户，旧开发服务仍使用启动时的值。
- **在 dev 源码里搜索不到品牌字面值就判断失败**：当前 Vite 8 的 dev 通过 `/@vite/env` 提供定义；生产构建才应断言标识符被静态替换。
- **字符串未经过 `JSON.stringify`**：容易生成无效 JavaScript，或被解释成不存在的标识符；布尔值也不应误写成带引号的字符串。
- **把秘密写进租户 JSON，或把布尔开关当权限**：选中的配置可以在 dev 响应或生产产物中被读取，用户也能修改前端代码；秘密必须留在服务端，权限必须由服务端执行。
- **期待 `betaPanel: false` 自动删除 Beta 面板源码**：这里的 `v-if="tenant.betaPanel"` 控制是否渲染，不保证面板分支被 tree-shaking。产物断言应检查品牌、主题等唯一值，不要误把“面板文本消失”当作本例承诺。
- **复用同一个 `outDir` 做对照**：后一次构建会覆盖前一次证据，因此本例使用 `dist` 与 `dist-beta`。

:::

环境变量与客户端公开边界见 [ch04 环境变量](../../guide/ch04-env.md)；插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。如果还需要按标记删除开发专用代码，可对照阅读 [生产配置替换与条件编译](./04-conditional-build.md)。
