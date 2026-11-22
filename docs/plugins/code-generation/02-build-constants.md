# 编译期常量：版本号、构建时间、Git commit、环境标识

排查线上问题时，仅知道应用名称通常不够：还要确认部署的是哪个版本、哪次构建、哪个 Git 提交，以及使用了哪个 Vite mode。本例把这些信息集中生成到一个模块中，让首页和代码生成示例页展示同一份元数据。

::: tip 现成方案速览
- **官方 / 成熟方案**：Vite 官方 [`define`](https://vite.dev/config/shared-options.html#define) + `import.meta.env`；版本号、构建时间、Git commit 在 `vite.config` 中采集后注入。
- **覆盖程度**：**官方已覆盖**。
- **本例定位**：教学用最小实现，重点是理解 `configResolved` 如何收集构建信息，以及虚拟模块如何导出结构化常量；生产项目直接用 `define` / 环境变量即可。
- **值得自研的时机**：需要团队统一的“构建身份”虚拟模块协议，或要让多种工具共享同一份生成结果时。
:::

## 先看懂：插件在做什么

一句话概括：**`package.json`、最终 Vite 配置、Git 和插件创建时间是输入，`virtual:app-info` 是生成结果，Vue 页面消费的仍然是一个普通 JavaScript 对象。**

这里的“编译期常量”是指：值由 Vite 在开发服务或构建过程中收集并写进模块代码，而不是等用户打开页面后再由浏览器计算。“虚拟模块”则指磁盘上没有对应的 `virtual:app-info` 文件，模块源码由插件生成。

```text
package.json ─────────────→ name、version、vite
插件实例创建时记录时间 ────→ builtAt
最终 Vite 配置 ───────────→ mode
git rev-parse --short HEAD → gitCommit
              ↓
   load 生成一个默认导出对象
              ↓
       virtual:app-info
        ├─ CodeGenerationDemos.vue → 展示六个字段
        └─ Home.vue ─────────────→ 展示名称、版本、Vite 版本和时间戳
              ↓ 生产构建
       元数据成为构建 JS 中的固定值
```

浏览器只导入生成结果：它不读取项目的 `package.json`，不执行 Git，也不通过 `Date.now()` 冒充构建时间。

## 一个完整示例：从元数据到页面表格

### 1. 输入：六个字段分别从哪里来

完整实现位于 `plugins/virtual-app-info.ts`，插件工厂函数是 `appInfoPlugin()`。六个导出字段与真实输入一一对应：

| 字段 | 真实来源 | 当前项目中的值或含义 |
| --- | --- | --- |
| `name` | `pkg.name` | `vite-learning` |
| `version` | `pkg.version` | `0.1.0` |
| `vite` | `pkg.devDependencies.vite` | `^8.3.8`，即 `package.json` 声明的版本范围，不是安装后的精确版本号 |
| `builtAt` | `new Date().toISOString()` | 创建本次插件实例时的 ISO 时间；开发态通常接近服务启动时间 |
| `gitCommit` | `git rev-parse --short HEAD` | 配置解析时的 Git 短提交；命令失败则为 `unavailable` |
| `mode` | `config.mode` | 本次最终 Vite mode，例如 `development`、`production` 或 `staging` |

前三个值来自当前 `package.json`。后三个值会随插件实例、仓库状态和启动命令变化，因此不能把某一次运行的结果写成永远固定的常量。

### 2. 生成：一个默认导出的 ESM 对象

ESM 是 JavaScript 的模块格式，也就是使用 `import` 和 `export` 组织代码。插件最终生成的模块只有一个默认导出，结构如下。

下面保留真实字段和当前 `package.json` 的静态值；`builtAt`、`gitCommit` 使用占位字符串表示动态值，所以这是一份**简化示意**，不是某次运行的固定响应：

```js
export default {"name":"vite-learning","version":"0.1.0","vite":"^8.3.8","builtAt":"<插件实例创建时的 ISO 时间>","gitCommit":"<短提交或 unavailable>","mode":"development"}
```

这份源码不是提前写好的 `.js` 文件，而是 `load` 钩子返回的字符串。业务代码因此可以像导入普通模块一样使用它：

```ts
import appInfo from 'virtual:app-info'
```

注意这里是**默认导出对象**，不是分别导出的 `name`、`builtAt` 等变量。

### 3. 消费：示例页直接读取对象字段

`src/views/plugins/categories/CodeGenerationDemos.vue` 使用上面的默认导入，并在 `id="build-constants"` 的区块中渲染六个字段。以下模板与真实源码一致：

```vue
<tr><th>name</th><td>{{ appInfo.name }}</td></tr>
<tr><th>version</th><td>{{ appInfo.version }}</td></tr>
<tr><th>vite</th><td>{{ appInfo.vite }}</td></tr>
<tr><th>builtAt</th><td><time :datetime="appInfo.builtAt">{{ appInfo.builtAt }}</time></td></tr>
<tr><th>gitCommit</th><td><code>{{ appInfo.gitCommit }}</code></td></tr>
<tr><th>mode</th><td><code>{{ appInfo.mode }}</code></td></tr>
```

消费者不需要知道 Git 命令怎样执行，也不需要自己读取环境文件；它只处理 `appInfo` 对象。

`src/views/Home.vue` 是另一个消费方。它导入同一个 `virtual:app-info`，继续在原有“自定义插件”卡片中显示 `appInfo.name`、`appInfo.version`、`appInfo.vite` 和 `appInfo.builtAt`，本次增强没有改变 Home 的导入方式。

### 4. 结果：开发页面与生产产物看到同一份构建身份

开发时访问 `http://localhost:5211/plugin-lab/code-generation#build-constants`，可以看到六行元数据。生产构建时，虚拟模块同样进入模块图，六个值会被打包进 JS；浏览器打开产物页面时只读取这些固定值，不会再访问 Git 或重新生成时间。

因此，生产页面刷新后 `builtAt`、`gitCommit` 和 `mode` 都应保持不变。只有重新启动开发服务或重新构建，才可能得到新一批元数据。

## 生成结果背后的三个钩子与一次初始化

“钩子（hook）”是 Vite 在特定阶段调用的插件函数。看过页面和生成结果后，再按执行顺序阅读实现，就能理解每个值为什么在那个时候确定。

### 1. 创建插件实例：只记录一次 `builtAt`

`appInfoPlugin()` 被调用时，先执行：

```ts
const builtAt = new Date().toISOString()
let gitCommit = 'unavailable'
let mode = ''
```

`builtAt` 位于插件实例的闭包中。闭包可以简单理解为：这次插件实例一直保留着这三个变量，后续钩子读取和修改的是同一份状态。

所以，即使开发服务多次执行 `load`，`builtAt` 也不会变成每次请求或每次浏览器刷新的当前时间。它表示的是**插件实例创建时间**，不是页面打开时间，也不严格等于产物文件写入完成的时间。

### 2. `configResolved`：读取最终 mode 和 Git 提交

配置合并完成后，Vite 调用 `configResolved`。真实实现如下：

```ts
configResolved(config) {
  mode = config.mode
  try {
    gitCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: config.root,
      encoding: 'utf-8',
    }).trim()
  } catch {
    gitCommit = 'unavailable'
  }
}
```

这里有两个关键决定：

- `mode = config.mode` 读取本次命令的最终配置，而不是硬编码 `production`。`package.json` 中的 `build:staging` 对应 `vite build --mode staging`，所以这里会得到 `staging`。
- Git 命令以 `config.root` 为工作目录。没有 `.git`、没有安装 Git 或命令执行失败时，保留其他字段，只把 `gitCommit` 回退为 `unavailable`。

这两个值只在这个阶段采集一次。开发服务运行期间即使 `HEAD` 已变化，本插件也不会自动重新执行 Git；需要重启服务让配置重新解析。

### 3. `resolveId`：把公开导入名交给本插件

插件用两个常量区分业务导入名和内部模块 ID：

```ts
const VIRTUAL_ID = 'virtual:app-info'
const RESOLVED_ID = '\0' + VIRTUAL_ID
```

`resolveId` 只认领这个公开 ID：

```ts
resolveId(id) {
  if (id === VIRTUAL_ID) return RESOLVED_ID
}
```

内部 ID 的 `\0` 前缀是 Rollup/Vite 的虚拟模块约定，可以避免其他插件把它继续当作普通文件路径处理。**业务代码仍然只写 `virtual:app-info`，不写 `\0`。** 未命中时返回 `undefined`，让 Vite 继续解析其他模块。

### 4. `load`：读取 `package.json` 并返回模块源码

当 Vite 加载刚才的内部 ID 时，`load` 返回真正的 JavaScript 源码。下面是去掉注释后的真实核心实现：

```ts
load(id) {
  if (id !== RESOLVED_ID) return

  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
  ) as { name: string; version: string; devDependencies: Record<string, string> }

  return `export default ${JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    vite: pkg.devDependencies.vite,
    builtAt,
    gitCommit,
    mode,
  })}`
}
```

`JSON.stringify` 在这里负责“序列化”，也就是把内存中的值转换成可以安全嵌入 JavaScript 源码的文本。`load` 必须返回模块源码字符串，而不是直接返回一个对象。

读取 `package.json` 发生在 Vite 的 Node.js 进程中，也就是运行开发服务或构建的工具侧；它不会变成浏览器运行时请求。到了生产环境，生成对象已经随模块进入构建产物。

完整过程可以串成：

```text
appInfoPlugin() 创建实例并记录 builtAt
  → configResolved 保存 mode、执行一次 Git
  → import 'virtual:app-info'
  → resolveId 返回 \0virtual:app-info
  → load 读取 package.json 并生成 export default ...
  → Vue 页面取得 appInfo 对象
```

## 接入：注册、类型声明和示例路由

### 1. 插件已经由共享配置注册

`plugins/code-generation/index.ts` 中的 `codeGenerationPlugins()` 汇总本类插件，真实数组包含 `appInfoPlugin()`：

```ts
export function codeGenerationPlugins(): Plugin[] {
  return [generatedModulesPlugin(), autoDiscoveryPlugin(), onDemandDataPlugin(), appInfoPlugin()]
}
```

`vite.config.ts` 已在 `plugins` 数组中展开 `...codeGenerationPlugins()`，所以本例不需要再单独注册一次。每次调用 `codeGenerationPlugins()` 都会创建新的 `appInfoPlugin()` 实例，也就重新记录一次 `builtAt`。

### 2. 类型声明让虚拟模块不退化为 `any`

`src/types/plugins.d.ts` 为默认导出声明了六个字符串字段：

```ts
declare module 'virtual:app-info' {
  const info: {
    name: string
    version: string
    vite: string
    builtAt: string
    gitCommit: string
    mode: string
  }
  export default info
}
```

`tsconfig.json` 的 `include` 已覆盖 `src/**/*.d.ts`。因此两个 Vue 消费方能获得字段提示和类型检查；新增或删除生成字段时，也要同步维护这份声明。

### 3. 示例路由与页内锚点

`src/plugin-lab/routes/code-generation.ts` 中的真实路由记录把分类页指向上述消费组件：

```ts
{
  path: '/plugin-lab/code-generation',
  name: 'plugin-code-generation',
  component: () => import('@/views/plugins/categories/CodeGenerationDemos.vue'),
}
```

组件内的 `section id="build-constants"` 提供页内锚点，所以完整示例地址是 `/plugin-lab/code-generation#build-constants`。`src/plugin-lab/catalog/code-generation.ts` 中的教程与示例链接也使用这个地址；Home 则继续由 `/` 路由展示。

## 开发态与生产态分别发生了什么

| 阶段 | 元数据何时确定 | 可以观察到什么 |
| --- | --- | --- |
| 开发服务启动 | 创建插件实例时记录 `builtAt`，`configResolved` 采集 `mode` 和 `gitCommit` | 默认 `mode` 为 `development`；同一服务进程内刷新页面，`builtAt` 不变 |
| 开发模块加载 | `load` 读取 `package.json` 并返回模块源码 | 可通过 Inspect 或 `/@id/__x00__virtual:app-info` 查看生成结果 |
| 生产构建 | 同一份插件状态用于生成虚拟模块，生成结果进入模块图 | 默认 `mode` 为 `production`；元数据成为构建 JS 中的固定值 |
| 产物页面运行 | 浏览器只执行已经生成的 JS | 刷新不改变构建身份；运行时不执行 Git，也不存在对虚拟模块 URL 的网络请求 |

## 验证步骤

### 1. 检查开发页面与生成模块

运行：

```bash
pnpm exec vite --port 5211
```

访问 `http://localhost:5211/plugin-lab/code-generation#build-constants`。

预期结果：页面展示六个字段；`name` 为 `vite-learning`，`version` 为 `0.1.0`，`vite` 为 `^8.3.8`，`mode` 为 `development`；`builtAt` 是 ISO 时间，`gitCommit` 是当前短提交。如果当前环境无法执行 Git，只有 `gitCommit` 应显示 `unavailable`，其他字段仍应正常展示。

再打开 `http://localhost:5211/`。预期结果：Home 的“自定义插件”卡片与分类页显示相同的名称、版本、Vite 版本范围和 `builtAt`。

也可以直接对比 Git 与虚拟模块响应：

```bash
git rev-parse --short HEAD
curl http://localhost:5211/@id/__x00__virtual:app-info
```

预期结果：响应包含 `export default` 和六个字段；在 Git 可用时，响应中的 `gitCommit` 与第一条命令输出一致，`mode` 为 `development`。

### 2. 检查时间戳的生命周期

记录第一次页面或 `curl` 响应中的 `builtAt`，刷新页面并再次请求模块。

预期结果：只要仍是同一个开发服务实例，`builtAt` 就完全相同，不会变成刷新时间。停止并重新启动开发服务后，预期会得到新插件实例记录的 `builtAt`；分类页和 Home 仍应显示同一个新值。

### 3. 在 Inspect 中核对钩子结果

打开 `http://localhost:5211/__inspect/`，搜索 `virtual:app-info`。

预期结果：可以看到公开 ID 被解析为带 `\0` 前缀的内部 ID，`load` 结果包含前面的默认导出对象。页面展示值应与这份生成结果一致。

### 4. 检查生产构建与自定义 mode

先执行默认生产构建并启动产物服务：

```bash
pnpm build
pnpm exec vite preview --port 5311
```

访问 `http://localhost:5311/plugin-lab/code-generation#build-constants`。

预期结果：六个字段正常显示，`mode` 为 `production`；`gitCommit` 对应执行构建时的 `HEAD`，多次刷新不会改变 `builtAt`。产物 JS 中能找到这些元数据，页面运行不会发起 `/@id/__x00__virtual:app-info` 请求。

停止上一个 preview，再重新执行：

```bash
pnpm build:staging
pnpm exec vite preview --port 5311
```

预期结果：重新构建后的页面 `mode` 为 `staging`。`build:staging` 会重新生成 `dist`，因此应检查新构建的页面，而不要沿用上一次构建的结果。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 生产级实现还需补齐

- CI 中建议同时注入不可变镜像 digest、流水线编号和完整 commit，并建立构建元数据与发布记录的对应关系。短提交适合展示，不应成为唯一发布凭据。
- 当前实现会捕获 Git 错误并回退为 `unavailable`，适合保证教学示例继续运行。正式发布如果强依赖 commit，应增加明确日志或失败策略，避免静默发布无法追踪的产物。
- 如果部署来自不含 `.git` 的源码压缩包，应在打包前由 CI 写入可信版本文件或注入元数据；`unavailable` 不能替代正式版本标识。
- 对可复现构建，应由 CI 显式提供 `SOURCE_DATE_EPOCH` 等统一时间来源。当前源码只调用 `new Date().toISOString()`，并没有读取 `SOURCE_DATE_EPOCH`，需要扩展实现后才能达到这一目的。
- 当前 `vite` 字段是 `package.json` 中的依赖范围。若排障需要精确到实际安装版本，应改为读取可信的安装版本信息，并明确 lockfile、构建日志与产物之间的对应关系。
- 只注入公开元数据。秘密环境变量绝不能因为“编译期常量”机制而被序列化进浏览器模块；进入生成对象的内容都应视为用户可见。

:::

::: details 常见坑

- **在浏览器里取时间**：`Date.now()` 或 `new Date()` 如果由页面代码执行，只能表示页面打开时间，不能定位构建产物。本例的时间来自插件实例创建阶段。
- **把 `builtAt` 当成精确的构建结束时间**：它在插件工厂执行时记录，通常更接近开发服务启动或构建初始化时间；需要严格构建阶段时间时，应另外定义采集点。
- **使用错误的 mode**：`configResolved` 得到的是本次最终配置。不要硬编码 `production`，也不要把 `NODE_ENV` 与 Vite mode 混为一谈；`vite build --mode staging` 的 `config.mode` 是 `staging`。
- **把 Vite 依赖范围当成精确版本**：本例的 `vite` 值来自 `pkg.devDependencies.vite`，所以显示 `^8.3.8` 是符合源码的结果，并不表示插件读取了 `node_modules` 中的实际版本。
- **构建后 Git 值看似落后一个提交**：构建记录的是执行构建时的 `HEAD`。如果先构建再提交源码，产物自然记录父提交；发布流程应在源码提交固定后构建。
- **期待运行中的开发服务自动更新所有元数据**：`gitCommit` 和 `mode` 只在 `configResolved` 中采集，本插件也没有为 `package.json` 或 Git `HEAD` 增加监听与模块失效逻辑。修改这些输入后，应重启开发服务再核对结果。
- **每个模块重复读 Git 和当前时间**：这会让同一次构建出现互相矛盾的提交或时间。元数据应像本例一样统一生成，再由多个页面共享。
- **把虚拟模块当成 `define` 或 `import.meta.env` 替换**：本例生成的是需要显式 `import appInfo` 的默认导出对象，不会把业务代码中的标识符逐个替换，也不会自动扩展 `import.meta.env`。
- **直接拼接未经序列化的值**：引号、换行等字符可能破坏生成源码。应保留 `JSON.stringify`，并只生成本例这样的受控数据。

:::

本例是在 [ch10 虚拟模块](../../guide/ch10-plugins.md) 上的增量增强；输入文件驱动的代码生成见 [第 1 项](./01-generated-modules.md)。
