# 18. 生成 SSR / 资源映射 manifest

页面入口最终叫 `assets/index-C1WrvEec.js`，还是另一个带新哈希的文件，只有构建后才知道。服务端渲染（SSR，即由服务端执行应用并生成 HTML）或部署脚本要拼接 `<script>`、`<link>` 时，不能把某个哈希文件名写死，而需要一份 **manifest（资源清单）** 告诉它：某个入口这次实际生成了哪些文件。

本例在构建期生成 `dist/lab-manifest.json`，记录主入口 `index` 的 JS、CSS 和直接静态依赖。它是一份刻意裁剪的教学清单，**不是完整的 SSR 实现，也没有复刻 Vite 内建 manifest 的全部能力**。

::: tip 现成方案速览
- **官方 / 成熟方案**：Vite 官方 [`build.manifest`](https://vite.dev/config/build-options#build-manifest) 与 `build.ssrManifest`。
- **覆盖程度**：**官方已覆盖**。
- **本例定位**：教学用最小实现，重点是理解 `generateBundle` 如何读取 bundle 结构和资源关系，并发射自定义清单。
- **值得自研的时机**：后端要求裁剪字段或额外映射时，在官方 manifest 上写薄适配层。
:::

## 先看懂：插件在做什么

一句话概括：**构建器已经算出的入口 chunk 和资源关系是输入，`lab-manifest.json` 是生成结果，构建断言与后续部署清单插件是本项目中的实际消费者。**

这里的 **chunk** 是构建器输出的一份 JavaScript 代码，例如入口 JS、公共依赖 JS；**asset** 是 CSS、图片、JSON 等其他产物。两者都会先出现在内存中的 `bundle`，再由构建器统一写盘。

```text
index.html → /src/main.ts → 应用模块与 CSS
                     │
                     │ pnpm build
                     ▼
内存 bundle
  ├─ index 入口 chunk
  │    ├─ 最终 JS 文件名
  │    ├─ importedCss
  │    └─ imports
  └─ admin 入口 chunk（本例不选）
                     │
                     │ ssrManifestPlugin()
                     │ generateBundle
                     ▼
          dist/lab-manifest.json
                     │
          ├─ 本指南的 Node 断言
          │    └─ 检查文件存在，并对照 dist/index.html
          │
          └─ deploymentArtifactsPlugin()
               └─ 收录进 version.json 与 cdn-manifest.json
```

真实 SSR 项目还会让服务端按入口名读取类似清单，再生成当前页面所需的资源标签；**本仓库没有这样的 SSR 服务端消费代码**。当前示例能验证的是“清单正确描述了本次构建”，不能据此声称已经完成服务端渲染。

## 一个完整示例：从 `index` 入口到资源清单

### 1. 输入：HTML 入口、应用模块和构建后的 chunk 关系

主页面 `index.html` 使用真实的源码入口：

```html
<script type="module" src="/src/main.ts"></script>
```

`src/main.ts` 创建 Vue 应用，并引入全局样式。下面仅保留与本例直接相关的一行，省略其他 import 和启动逻辑：

```ts
import './styles/main.css'
```

构建后，源码中的 `/src/main.ts` 不会原样成为浏览器加载地址。Vite 会完成打包、代码分割、CSS 提取和内容哈希命名。下面的文件名来自仓库当前一次真实构建；**重新构建后哈希可能变化，应始终以本次生成的清单为准**：

```text
assets/index-C1WrvEec.js                 index 入口 chunk
assets/index-Bl-LcrJZ.css               与 index 关联的 CSS
assets/modulepreload-polyfill-P2Xu9kJm.js  index 的直接静态依赖
assets/vendor-vue-CO0MvktY.js            index 的直接静态依赖
```

这里的“静态依赖”是代码通过 `import ... from ...` 建立的依赖；`import(...)` 是动态依赖，记录在另一个字段 `dynamicImports` 中，本例不会把它放进清单。

项目并不只有一个构建入口：`plugins/html/mpa-entry.ts` 的 `mpaEntry()` 还注册了 `admin.html`，因此本次 `bundle` 中也有 `admin` 入口 chunk。本插件明确优先寻找 `output.name === 'index'`，所以下面这份清单只描述主入口，不包含 `assets/admin-D6h3ND5y.js`。

### 2. 生成结果：`dist/lab-manifest.json`

上述输入经过 `ssrManifestPlugin()` 后，当前一次构建得到：

```json
{
  "entry": "index",
  "file": "assets/index-C1WrvEec.js",
  "css": [
    "assets/index-Bl-LcrJZ.css"
  ],
  "imports": [
    "assets/modulepreload-polyfill-P2Xu9kJm.js",
    "assets/vendor-vue-CO0MvktY.js"
  ]
}
```

四个字段分别回答四个问题：

| 字段 | 数据来源 | 消费者能据此做什么 |
| --- | --- | --- |
| `entry` | `chunk.name` | 知道这份清单描述的是 `index` 入口 |
| `file` | `bundle` 中该入口的文件名键 | 生成入口 `<script>` 的资源地址 |
| `css` | `chunk.viteMetadata.importedCss` | 生成样式 `<link>` |
| `imports` | `chunk.imports` | 找到入口直接静态依赖的 chunk，可用于预加载或继续分析 |

清单中的路径都是**相对于 `dist` 的文件名**，没有 `/` 前缀，也没有重复写成 `dist/assets/...`。这样消费者可以自行结合 Vite `base`、站点子路径或 CDN 域名生成公开 URL。

### 3. 消费：本仓库验证什么，没有实现什么

这份 JSON 在当前项目中有两类实际读者：

- **本指南下方的 Node 断言**：读取 `file`、`css`、`imports`，确认每个文件都存在，再确认 `dist/index.html` 对同一批资源的引用一致。
- **`deploymentArtifactsPlugin()`**：它在更晚的 `post` 阶段遍历 `bundle`，会把刚生成的 `lab-manifest.json` 也纳入 `version.json` 和 `cdn-manifest.json`。这是通用的逐文件哈希处理，不是 SSR 渲染。

需要特别区分：**`dist/index.html` 是 Vite 自己生成的，并不是读取 `lab-manifest.json` 后生成的。** 本例只是用 HTML 交叉验证清单，所以没有“清单驱动页面”的运行时链路。真正的 SSR 服务端、资源注入器或上传脚本需要由使用方另外实现。

### 4. 构建结果与页面入口

当前构建的 `dist/index.html` 引用了同一份入口、静态依赖和 CSS。下面省略其他注入标签以及 `integrity`、`crossorigin` 属性，只保留对照所需的真实路径：

```html
<script type="module" src="/assets/index-C1WrvEec.js"></script>
<link rel="modulepreload" href="/assets/modulepreload-polyfill-P2Xu9kJm.js">
<link rel="modulepreload" href="/assets/vendor-vue-CO0MvktY.js">
<link rel="stylesheet" href="/assets/index-Bl-LcrJZ.css">
```

主应用的 `/plugins#build-output-ssr-manifest` 只提供“构建验证”说明和指南链接。`src/plugin-lab/routes/build-output.ts` 中 `buildOutputRoutes` 是空数组，本例也没有 `demo` 页面；这是正常现象，因为 `apply: 'build'` 的插件在开发服务器中不运行，dev 下没有等价的最终 chunk 和 manifest 可观察。

## 核心原理：在 `generateBundle` 中整理并发射清单

看完结果，再回头看钩子就明确了：**`generateBundle` 在产物写盘前执行，能从 `bundle` 读到本次构建的完整输出对象；插件不需要猜哈希，也不应该提前扫描 `dist`。**

`plugins/build-output/ssr-manifest.ts` 的完整可执行逻辑如下。这里只省略源码注释，`LabManifest` 类型、空入口报错、类型保护和字段读取均与真实源码一致：

```ts
import type { Plugin } from 'vite'

interface LabManifest {
  entry: string
  file: string
  css: string[]
  imports: string[]
}

export function ssrManifestPlugin(): Plugin {
  return {
    name: 'lab:build-output:ssr-manifest',
    apply: 'build',

    generateBundle(_options, bundle) {
      const entries = Object.entries(bundle).filter(
        ([, output]) => output.type === 'chunk' && output.isEntry,
      )

      if (entries.length === 0) {
        this.error('没有找到入口 chunk，无法生成 lab-manifest.json')
      }

      const [fileName, chunk] = entries.find(([, output]) => output.name === 'index') ?? entries[0]

      if (chunk.type !== 'chunk') return

      const manifest: LabManifest = {
        entry: chunk.name,
        file: fileName,
        css: [...(chunk.viteMetadata?.importedCss ?? [])],
        imports: [...chunk.imports],
      }

      this.emitFile({
        type: 'asset',
        fileName: 'lab-manifest.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
  }
}
```

可以按四步理解：

1. **筛出入口。** `Object.entries(bundle)` 同时拿到输出文件名和输出对象；`output.type === 'chunk'` 排除 CSS 等 asset，`output.isEntry` 排除普通共享 chunk 和按需加载的动态 chunk。
2. **选定本例入口。** 没有入口时，`this.error(...)` 直接让构建失败；有入口时优先选择 `index`，找不到才退回 `entries[0]`。这个回退适合单入口教学，多入口项目不应照抄，后文会说明原因。
3. **复制需要的数据。** `viteMetadata` 是 Vite 附加在 Rolldown/Rollup chunk 上的元数据，不是标准 Rollup 字段。`importedCss` 是 `Set`，要展开成数组才能直接形成 JSON 中的 `css`；`imports` 则复制为普通字符串数组。
4. **把 JSON 作为新 asset 发射。** `this.emitFile` 将固定名称的 `lab-manifest.json` 交给构建器统一写盘，因此最终位置是 `build.outDir` 指定的 `dist/lab-manifest.json`，后面的 `post` 插件也能继续处理它。

本插件使用普通阶段的 `generateBundle` 已足够，因为它只读取 chunk 及其元数据。Vite 的 HTML 插件要到 `generateBundle` 的 **`post`** 阶段才把 `index.html` 放进 `bundle`；如果扩展插件去读取或改写 HTML，就必须调整钩子的 `order`，不能在当前普通阶段直接访问 `bundle['index.html']`。

## 配置接入与插件顺序

插件已经接入，无需在业务代码中 import，也没有虚拟模块 ID。`plugins/build-output/index.ts` 中的实际顺序是：

```ts
return [
  replaceBuiltAssetsPlugin(),
  ssrManifestPlugin(),
  deploymentArtifactsPlugin(),
  staticDeploymentPlugin(),
]
```

`vite.config.ts` 通过 `...buildOutputPlugins()` 展开整个数组，并配置：

```ts
build: {
  outDir: 'dist',
  assetsDir: 'assets',
  // 省略其他构建配置
}
```

这个顺序解释了前面的消费关系：`ssrManifestPlugin()` 先在普通阶段发射清单，`deploymentArtifactsPlugin()` 后在 `post` 阶段把清单纳入哈希结果。若把自定义清单移到部署清单之后，后者就不会自然收录它。最后的 `staticDeploymentPlugin()` 负责 HTML 的 SRI 等工作，与本清单读取 chunk 的职责彼此独立。

## 验证步骤

### 1. 构建并观察产物

在仓库根目录运行：

```bash
pnpm build
```

预期结果：

- 构建成功，存在 `dist/lab-manifest.json`。
- `entry` 为 `index`，`file` 指向本次实际的 `assets/index-<hash>.js`。
- `css` 与 `imports` 中每一项都能在当前 `dist` 找到；哈希与上文不同并不代表失败。
- 同时仍存在 `dist/admin.html` 和 admin 入口 chunk，但这份单入口清单没有 admin 条目，这是当前实现的明确边界。

### 2. 用 Node 断言验证文件、HTML 与后续消费者

```bash
node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const manifest = JSON.parse(readFileSync(join(dist, 'lab-manifest.json'), 'utf8'))
const html = readFileSync(join(dist, 'index.html'), 'utf8')

if (manifest.entry !== 'index') throw new Error(`entry 应为 index，实际 ${manifest.entry}`)

for (const file of [manifest.file, ...manifest.css, ...manifest.imports]) {
  if (!existsSync(join(dist, file))) throw new Error(`清单中的文件不存在: ${file}`)
}

const scriptSrc = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/)?.[1]
if (!scriptSrc?.endsWith(`/${manifest.file}`)) {
  throw new Error(`HTML 入口 ${scriptSrc} 与 manifest.file ${manifest.file} 不一致`)
}

const linkUrls = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1])
for (const file of [...manifest.css, ...manifest.imports]) {
  if (!linkUrls.some((url) => url.endsWith(`/${file}`))) {
    throw new Error(`HTML 未引用清单资源: ${file}`)
  }
}

const version = JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8'))
if (!version.files['lab-manifest.json']) {
  throw new Error('后续部署清单没有收录 lab-manifest.json')
}

console.log(`manifest OK: ${manifest.entry} -> ${manifest.file}`)
console.log('deployment OK: version.json 已收录 lab-manifest.json')
NODE
```

在当前构建上，预期输出的文件名形如：

```text
manifest OK: index -> assets/index-C1WrvEec.js
deployment OK: version.json 已收录 lab-manifest.json
```

断言使用 URL 后缀比较，因此默认根路径和 `/vite-learning/` 子路径部署都能检查同一份相对文件映射。任一步失败都会打印具体文件名，而不是只留下“构建成功”这一无法证明清单正确的日志。

## 什么时候直接用 Vite 内建 `build.manifest`

如果目标是给 SSR 框架提供完整的“源模块 → 构建产物”映射，优先使用 Vite 原生能力，而不是维护一份裁剪协议：

```ts
build: {
  manifest: true, // 生成 .vite/manifest.json
}
```

本仓库当前没有开启这个选项。它与教学清单的区别不只是字段多少：

| 对比项 | 本例 `lab-manifest.json` | Vite 内建 manifest |
| --- | --- | --- |
| 整体结构 | 一个入口对应一个对象 | 以源模块 ID 等稳定键组织的完整映射 |
| 入口范围 | 只选 `index`，找不到时回退到第一个入口 | 处理多入口、动态入口及对应关系 |
| 依赖字段 | `imports` 直接保存最终文件名 | `imports` / `dynamicImports` 保存待继续解析的清单键 |
| 其他信息 | 只有 `entry`、`file`、`css`、`imports` | 还可包含 `src`、`name`、`isEntry`、`isDynamicEntry`、`assets` 等 |

只有需要裁剪字段、增加版本号或 CDN 前缀等业务标识，或者对接已有的自有 SSR 运行时协议时，才值得保留自定义格式。通用 SSR 资源解析应优先评估内建 manifest，并按它的键继续解析依赖，而不能把两种 `imports` 的含义混为一谈。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 生产级实现还需补齐

- **多入口映射**：输出 `Record<string, LabManifest>` 等按入口名索引的结构，分别处理 `index`、`admin`。不要依赖 `entries[0]`，否则入口顺序变化可能悄悄选错页面；缺少约定入口时更适合直接报错。
- **完整依赖与 CSS**：当前 `imports` 只有直接静态依赖。需要完整预加载列表时，应递归解析 `bundle` 中的静态 `imports`，合并各层 chunk 的 CSS，并去重、稳定排序。动态 `dynamicImports` 应按当前请求实际匹配的页面收集，而不是把所有可能页面都无差别预加载。
- **资源种类**：本例没有记录 `viteMetadata.importedAssets`，也没有内建 manifest 的 `src`、动态入口等映射。字体、图片、纯 CSS 入口或多环境构建有需求时，应扩展协议或直接使用内建能力。
- **公开 URL**：清单保持相对路径是刻意设计。消费者要结合部署 `base` 或受控 CDN 配置生成 URL，并处理结尾斜杠；不要在清单里写死 `/`，也不要用文件路径拼接规则处理 URL。
- **构建校验**：在更晚的 `post` 阶段检查 `bundle` 中的每个引用，或在 `writeBundle` 后检查磁盘文件，防止插件顺序调整、产物删除或多次输出导致悬空路径。
- **缓存策略**：`lab-manifest.json` 文件名没有内容哈希，应视为每次构建都会更新的元数据，不要套用带哈希 `assets/*` 的 immutable 长缓存。它进入 CDN 上传清单也不代表所有平台都应该公开或上传这份文件。
- **SSR 边界**：真实 SSR 通常还涉及客户端构建、服务端构建、路由匹配和水合。生成资源清单只解决“服务端如何找到客户端资源”这一小部分，不会自动提供服务端渲染能力。

:::

::: details 常见坑

- **把 `imports` 当成完整依赖图**：它只含直接静态 chunk。更深层的静态依赖及其 CSS 需要递归收集；动态 import 在 `chunk.dynamicImports`，本例完全没有展开。
- **直接序列化 `importedCss`**：它是 `Set`，不是数组。源码使用 `[...(chunk.viteMetadata?.importedCss ?? [])]` 转为 JSON 数组；省略这一步会得到不符合预期的数据。
- **在普通 `generateBundle` 中读取 HTML**：此时 `index.html` 尚未进入 `bundle`。本插件不读 HTML 所以不受影响；需要处理最终 HTML 的插件应使用 `order: 'post'` 或合适的后续钩子。
- **过早读取 `process.cwd()/dist`**：`generateBundle` 执行时产物还没统一写盘，扫描目录既可能读不到文件，也可能混入旧构建。本次构建关系应读 `bundle`，新清单应通过 `this.emitFile` 发射。
- **多入口仍使用单对象或随意回退**：本项目确实存在 `admin` 入口，但清单只选 `index`。换到其他项目时，`entries[0]` 不是可靠的业务入口约定。
- **混淆自定义与内建 manifest 的 `imports`**：本例保存的是最终文件名，内建 manifest 保存的是清单键；消费者不能用同一套取值逻辑直接处理两种格式。
- **忽略插件顺序**：本项目的 `version.json` 能收录 `lab-manifest.json`，依赖清单先发射、哈希插件后执行。调整顺序后要重新验证后续消费者。
- **把清单当带哈希静态资源缓存**：固定文件名会被下一次构建覆盖，长缓存会让服务端继续读取旧入口。
- **省略 JSON 结尾换行**：不影响 JSON 解析，但容易让部分部署工具或代码评审产生无换行提示；真实源码通过模板字符串末尾的 `\n` 统一补上。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；如果需要处理清单之后的逐文件哈希与 CDN 元数据，可继续阅读 [版本文件和 CDN 清单](./02-deployment-artifacts.md)。
