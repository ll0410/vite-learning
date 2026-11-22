# 21. 替换产物中的占位域名

同一份前端代码部署到测试、预发、生产环境时，公开资源域名可能不同。运行时再请求配置会增加首屏请求和失败面；另一种做法是在构建期把**受控占位符**（预先写在源码中、专门等待构建替换的标记）替换成目标公开域名。

本例的输入是源码中的 `__PUBLIC_ORIGIN__`，目标值是 `https://static.example.com`。后者是 RFC 2606 保留的示例域名；本例只观察字符串，不会真的请求它。

::: tip 现成方案速览
- **官方 / 成熟方案**：能在源码阶段替换时，优先 Vite `define` 或 Rolldown `replacePlugin`；`@rollup/plugin-replace` 只声明 Rollup 1–4，接入 Vite 8 前需要验证。
- **覆盖程度**：**部分覆盖**。
- **本例定位**：教学用最小实现，重点是理解构建后只处理文本产物、二进制原样保留的边界。
- **值得自研的时机**：发布流程确实要求对 `dist` 做后处理，且不能回到源码阶段替换时。
:::

## 先看懂：插件在做什么

一句话概括：**fixture 提供受控字符串，应用入口让它进入模块图（从入口出发收集到的依赖关系），构建插件改写产物，运行时与部署清单消费替换后的结果。**

这里的 fixture 指专门用于验证的受控示例数据。构建后生成的 JS 文件称为 **chunk**；CSS、JSON、图片等非 JS 产物称为 **asset**；写盘前这些文件组成的内存集合称为 **bundle**。

```text
plugins/build-output/fixtures/public-origin.ts
  输入：__PUBLIC_ORIGIN__/build-output/logo.svg
        ↓ import
src/plugin-lab/setup/build-output.ts
  消费者：window.__LAB_PUBLIC_ORIGIN__ = publicOriginFixture
        ↓ src/main.ts 执行 setupPluginLab(app)
入口模块图
        ├─ 开发（dev）：构建插件不参与开发服务，window 中仍是占位符
        └─ 构建（build）：构建插件替换入口 JS chunk 中的占位符
                   ↓
             dist/assets/index-*.js
             https://static.example.com/build-output/logo.svg
                   ↓
             后续插件读取最终文件名和内容
             ├─ lab-manifest.json：记录入口 chunk 文件名
             ├─ version.json / cdn-manifest.json：记录最终内容摘要（SHA-256）
             └─ index.html：记录最终入口资源的完整性摘要（SRI）
```

插件还会处理 bundle 里的其他**文本 asset**，例如 CSS、JSON、SVG 和 TXT；图片、字体等二进制文件不在替换范围内。要注意：**当前 fixture 只进入入口 JS chunk，并没有分别生成带占位符的 CSS 或 JSON fixture。**

本例没有独立的交互示例页。`src/plugin-lab/routes/build-output.ts` 导出空数组，实验室首页只为本条目标记“构建验证”；验收以构建产物断言为主，以 dev 和产物预览（preview）中的 `window` 值为辅。

## 一个完整示例：从 fixture 到公开 URL

### 1. 输入：一个足够独特的占位符

`plugins/build-output/fixtures/public-origin.ts` 的完整导出是：

```ts
export const publicOriginFixture = '__PUBLIC_ORIGIN__/build-output/logo.svg'
```

替换插件中的两个目标常量分别是：

```ts
const PLACEHOLDER = '__PUBLIC_ORIGIN__'
const PUBLIC_ORIGIN = 'https://static.example.com'
```

占位符必须足够独特，避免误伤正常业务文案或其他工具的模板语法。这里只替换占位符部分，后面的 `/build-output/logo.svg` 路径原样保留。

### 2. 消费：让 fixture 真正进入应用入口

`src/plugin-lab/setup/build-output.ts` 把 fixture 挂到 `window`。下面保留完整消费逻辑，仅省略源码注释：

```ts
import type { PluginLabSetup } from '../types'
import { publicOriginFixture } from '../../../plugins/build-output/fixtures/public-origin'

export const setupBuildOutput: PluginLabSetup = () => {
  const target = window as Window & { __LAB_PUBLIC_ORIGIN__?: string }
  target.__LAB_PUBLIC_ORIGIN__ = publicOriginFixture
}
```

`src/plugin-lab/setup/index.ts` 把 `setupBuildOutput` 放进 `setups` 数组，`src/main.ts` 再执行：

```ts
setupPluginLab(app)
```

因此 fixture 不是一份孤立的示例文件：它沿着 `main.ts → setupPluginLab → setupBuildOutput` 进入 dev 与 build 的模块图。若删除这条消费链，打包器可能不会把 fixture 放进产物，插件也就找不到待替换内容。

### 3. dev 结果：消费者拿到的仍是占位符

启动开发服务器后，在任意应用页面的控制台执行：

```js
window.__LAB_PUBLIC_ORIGIN__
```

当前源码的预期返回值是：

```text
__PUBLIC_ORIGIN__/build-output/logo.svg
```

这不是替换失效，而是插件声明了 `apply: 'build'`，dev server 根本不会应用它。这样可以直接对照同一份输入在 dev 与 build 中的差异。

### 4. build 结果：入口 JS 中变成完整公开 URL

生产构建后，`dist/lab-manifest.json` 的 `file` 指向实际入口文件 `assets/index-*.js`。该文件中的受控字符串变为：

```text
https://static.example.com/build-output/logo.svg
```

星号表示内容哈希，文件名会随最终内容变化，不应把某一次构建的哈希写死。使用 preview 打开构建后的应用时，同一个 `window.__LAB_PUBLIC_ORIGIN__` 也会返回上面的公开 URL。

`publicOriginFixture` 在这里只是字符串，没有被用于 `fetch`、图片 `src` 或真正的资源导入，所以验证时不会出现对 `logo.svg` 的网络请求。

### 5. 下游结果：清单与 SRI 基于最终内容计算

替换不是整条链路的终点，后续插件还会继续消费 bundle：

- `ssrManifestPlugin()` 读取入口 chunk 的最终文件名，生成 `lab-manifest.json`。
- `deploymentArtifactsPlugin()` 读取最终 `chunk.code` 或 `asset.source`，计算 SHA-256，生成 `version.json` 与 CDN（内容分发网络）上传清单 `cdn-manifest.json`。SHA-256 是内容摘要，内容变化时摘要也应变化。
- `staticDeploymentPlugin()` 为入口 JS/CSS 计算 SRI，并写入 HTML 的 `integrity` 属性。SRI（子资源完整性）让浏览器比对下载内容与摘要，不一致就拒绝执行或应用资源。

所以本例要保证的不只是“字符串看起来换掉了”，还包括文件名、版本清单与完整性摘要都对应替换后的内容。

## 核心原理：为什么需要两个转换钩子

看完输入和结果，再回头看 `plugins/build-output/replace-built-assets.ts`。插件名称是 `lab:build-output:replace-built-assets`，核心函数是 `replaceBuiltAssetsPlugin()`。

### 1. `apply: 'build'`：只在构建阶段应用

`apply: 'build'` 是 Vite 插件的应用条件。它让整条替换逻辑只进入生产构建，不改变 dev 响应，便于发现“本地正常、产物域名却错误”这类问题。

### 2. `renderChunk`：在 JS 文件名哈希确定前改写代码

`renderChunk` 接收单个 JS chunk 的代码。本例在这里替换，是因为此时代码仍可修改，随后的内容哈希能反映替换结果。

### 3. `generateBundle`：写盘前改写在 bundle 中的文本 asset

`generateBundle` 能遍历尚未写盘的 bundle。`renderChunk` 只处理 chunk，因此 CSS、JSON 等 asset 要在这里直接修改 `output.source`。

插件只处理扩展名匹配白名单的 asset：

```ts
const TEXT_FILE = /\.(?:m?js|cjs|css|html|json|txt|svg|xml|map)$/i
```

`output.source` 可能是字符串，也可能是字节数组；后一种情况先用 `TextDecoder` 把字节解码成文本。白名单先于解码，避免把 PNG、字体等二进制内容当文本改写。

HTML 有一个重要的时序例外：虽然白名单包含 `.html`，但 Vite 生成的 HTML 要到 `generateBundle` 的 **post 阶段**（普通 `generateBundle` 之后的后置阶段）才进入 bundle，本插件的普通阶段看不到它。当前 fixture 位于 JS 中，不依赖 HTML 替换；真实 HTML 需求见后面的生产边界。

### 4. 对照关键源码

下面的 `replaceOrigin` 和 `countPlaceholders` 是真实源码中的辅助函数。`split/join` 会替换全部出现位置，也不需要转义正则特殊字符：

```ts
function replaceOrigin(source: string): string {
  return source.split(PLACEHOLDER).join(PUBLIC_ORIGIN)
}

function countPlaceholders(source: string): number {
  return source.split(PLACEHOLDER).length - 1
}
```

下面是 `replaceBuiltAssetsPlugin()` 的核心摘录。**省略了 import、源码注释以及 `generateBundle` 末尾的日志分支，其余名称和替换逻辑与真实源码一致：**

```ts
export function replaceBuiltAssetsPlugin(): Plugin {
  let replaced = 0

  return {
    name: 'lab:build-output:replace-built-assets',
    apply: 'build',

    buildStart() {
      replaced = 0
    },

    renderChunk(code) {
      const count = countPlaceholders(code)
      if (count === 0) return null

      replaced += count
      return { code: replaceOrigin(code), map: null }
    },

    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'asset' || !TEXT_FILE.test(fileName)) continue

        const text = typeof output.source === 'string'
          ? output.source
          : new TextDecoder().decode(output.source)

        const count = countPlaceholders(text)
        if (count === 0) continue

        replaced += count
        output.source = replaceOrigin(text)
      }

      // 简化说明：真实源码在这里按 replaced 输出 warning 或 info。
    },
  }
}
```

几个返回值和计数细节值得对应着看：

- `renderChunk` 没有找到占位符时返回 `null`，表示不修改 chunk，并保留原有 source map（产物到源码的位置映射）。
- 找到后返回新 `code`；`map: null` 与本项目关闭 sourcemap 的配置相匹配，开启 sourcemap 时的限制见进阶部分。
- `replaced` 统计的是**占位符出现次数**，不是文件数。`buildStart` 每轮清零，避免 watch 模式（文件变化后自动重新构建）把上一轮数量累计进来。
- 完整源码在 `generateBundle` 末尾执行：若 `replaced === 0`，通过 `this.warn` 提示“没有在产物中找到 `__PUBLIC_ORIGIN__`”；否则通过 `this.info` 输出“已替换 N 处 `__PUBLIC_ORIGIN__` -> `https://static.example.com`”。

## 配置接入与插件顺序

`vite.config.ts` 已把构建输出插件展开到 `plugins` 中：

```ts
...buildOutputPlugins(),
```

`plugins/build-output/index.ts` 中的真实注册顺序是：

```ts
return [
  replaceBuiltAssetsPlugin(),
  ssrManifestPlugin(),
  deploymentArtifactsPlugin(),
  staticDeploymentPlugin(),
]
```

这个顺序与钩子阶段共同保证数据一致：

| 顺序 | 插件与阶段 | 消费或产出的内容 |
| --- | --- | --- |
| 1 | `replaceBuiltAssetsPlugin()`：`renderChunk`、普通 `generateBundle` | 先改写 JS chunk 与文本 asset |
| 2 | `ssrManifestPlugin()`：普通 `generateBundle` | 读取最终入口文件名，生成 `lab-manifest.json` |
| 3 | `deploymentArtifactsPlugin()`：post `generateBundle` | 对最终 chunk / asset 内容计算 SHA-256，生成版本与 CDN 清单 |
| 4 | `staticDeploymentPlugin()`：post `generateBundle` | 对最终 JS/CSS 计算 SRI，改写 HTML，并生成 `robots.txt`、`_headers` |

数组顺序主要决定同一钩子阶段内的执行先后，不能用它替代对钩子阶段的理解。这里的关键约束是：**JS 替换要早于文件名哈希，asset 替换要早于 post 阶段的清单与 SRI 计算。** 如果把替换挪到后两个消费者之后，清单或 `integrity` 就会对应旧内容。

## 验证步骤

### 1. 构建并检查替换日志

运行：

```bash
pnpm build
```

当前 fixture 在入口中被引用一次，构建日志应包含：

```text
已替换 1 处 __PUBLIC_ORIGIN__ -> https://static.example.com
```

同时不应出现“没有在产物中找到 `__PUBLIC_ORIGIN__`”的 warning。若以后调整 fixture 的引用次数，成功日志中的数量可以变化，但不能为 0。

### 2. 断言产物、下游哈希与二进制文件

继续在项目根目录执行下面的 Node 脚本。它检查四件事：文本产物没有残留占位符、真实入口包含目标 URL、`version.json` 记录的是最终入口内容哈希、PNG 与源文件哈希一致。

```bash
node --input-type=module - <<'NODE'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const dist = 'dist'
const target = 'https://static.example.com/build-output/logo.svg'
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})
const files = walk(dist)
const textFiles = files.filter((file) => /\.(?:m?js|cjs|css|html|json|txt|svg|xml|map)$/i.test(file))

for (const file of textFiles) {
  if (readFileSync(file, 'utf8').includes('__PUBLIC_ORIGIN__')) {
    throw new Error(`文本产物仍含占位符: ${relative(dist, file)}`)
  }
}

const manifest = JSON.parse(readFileSync(join(dist, 'lab-manifest.json'), 'utf8'))
const chunk = join(dist, manifest.file)
const code = readFileSync(chunk, 'utf8')
if (!code.includes(target)) throw new Error(`入口 JS 未包含目标 URL: ${manifest.file}`)

const digest = (source) => createHash('sha256').update(source).digest('hex')
const version = JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8'))
if (version.files[manifest.file] !== digest(code)) {
  throw new Error('version.json 中的入口哈希与最终内容不一致')
}

const image = files.find((file) => /assets[\\/]big-.*\.png$/.test(file))
if (!image) throw new Error('未找到待校验的 PNG 产物')
const imageBuffer = readFileSync(image)
if (!imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
  throw new Error('PNG 文件头损坏')
}
if (!imageBuffer.includes(Buffer.from('IEND'))) throw new Error('PNG 缺少 IEND 块')
if (digest(imageBuffer) !== digest(readFileSync('src/assets/big.png'))) {
  throw new Error('PNG 与源文件哈希不一致')
}

console.log(`replace OK: ${manifest.file} 已替换，version.json 哈希一致`)
console.log(`binary OK: ${relative(dist, image)} 与 src/assets/big.png 一致`)
NODE
```

预期没有任何断言错误，最后两行输出形式如下；`*` 代表每次构建可能变化的哈希：

```text
replace OK: assets/index-*.js 已替换，version.json 哈希一致
binary OK: assets/big-*.png 与 src/assets/big.png 一致
```

PNG 检查对应 `src/views/Assets.vue` 中真实导入的 `src/assets/big.png`，不是凭空选择的二进制文件。文件头、IEND 块用于快速识别明显损坏，最终的一致性由源文件与产物的 SHA-256 相等来保证。

### 3. 对照 dev 与 preview 中的运行时值

先启动 dev：

```bash
pnpm exec vite --port 5219 --strictPort
```

另一个终端请求真实 fixture 模块：

```bash
curl -s http://localhost:5219/plugins/build-output/fixtures/public-origin.ts
```

预期响应中仍有 `__PUBLIC_ORIGIN__/build-output/logo.svg`。打开 `http://localhost:5219/plugins#build-output-replace-assets`，控制台中的 `window.__LAB_PUBLIC_ORIGIN__` 也应是占位符。首页本身只展示“构建验证”和指南链接，不会直接显示这个 URL。

再启动产物预览：

```bash
pnpm exec vite preview --port 5319 --strictPort
```

打开 `http://localhost:5319/plugins#build-output-replace-assets`，预期同一个 `window.__LAB_PUBLIC_ORIGIN__` 变为：

```text
https://static.example.com/build-output/logo.svg
```

这一步验证的是业务消费者最终拿到的值；文本全量扫描、版本哈希和 PNG 一致性仍以前面的 Node 断言为准。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 生产级实现还需补齐

- **优先使用原生环境配置**：能通过 `import.meta.env` 或 `define` 注入的公开配置，优先使用 Vite 原生能力；占位符替换更适合必须出现在第三方产物或静态文本中的字符串。
- **支持多目标构建**：把 `PUBLIC_ORIGIN` 变成插件参数或环境变量，避免硬编码域名。公开域名可以进入产物，但不要把密钥等敏感信息当作替换值写进客户端 bundle。
- **更严格地区分文本与二进制**：按扩展名与 MIME（文件内容类型）白名单判断，必要时验证是否为合法 UTF-8；不要对所有 asset 统一执行 `TextDecoder`。
- **正确处理 HTML**：HTML 在 post 阶段才出现。若占位符会进入 HTML，应使用 `transformIndexHtml`，或把 HTML 替换放在顺序明确的 post `generateBundle` 中，并确保仍早于依赖最终 HTML 的处理。
- **补齐 source map**：本项目 `vite.config.ts` 设置了 `build.sourcemap: false`，所以示例返回 `map: null`。开启 sourcemap 后，应使用 `magic-string` 等工具同步生成替换后的映射，不能让映射仍指向旧字符串位置。
- **保留可观测性与 CI 断言**：统计替换次数，区分“未命中”和成功日志，并在持续集成（CI）中持续检查产物无占位符、清单哈希一致。生产项目还可按实际 asset 类型增加独立 fixture。

:::

::: details 常见坑

- **在 `generateBundle` 中才修改 JS chunk**：内容可能变了，但文件名内容哈希已经确定，文件名不再代表最终内容。JS 改写应放在 `renderChunk`。
- **对所有 `Uint8Array` 都解码并写回**：PNG、字体等二进制会被破坏。必须先筛选文本类型，当前白名单与 PNG 哈希断言就是为了防止这一问题。
- **把替换插件放到哈希清单或 SRI 之后**：`version.json`、`cdn-manifest.json` 或 `integrity` 会对应旧字节，后者还会导致浏览器拒绝加载资源。
- **忘记 `apply: 'build'`**：dev 也会替换，失去本例用于对照的基线，还可能掩盖只在生产构建出现的域名问题。
- **只替换 JS，或走向另一个极端替换所有文件**：前者会漏掉 CSS `url()`、JSON 配置等文本；后者会损坏二进制。需要明确的文本白名单。
- **假定普通 `generateBundle` 能处理 Vite HTML**：HTML 尚未进入 bundle，即使 `.html` 在白名单中也遍历不到，必须处理 post 时序。
- **只保留 fixture 文件，却删除入口消费链**：字符串可能根本没进入模块图。当前插件会发出未命中 warning，产物断言也会失败。
- **占位符过于普通**：可能误替换业务文案或其他模板标记，应使用项目专属、足够独特的标记。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；如果还需要理解后续清单与 SRI 的具体实现，可继续阅读 [hash 版本文件和 CDN 上传清单](./02-deployment-artifacts.md) 与 [SRI、robots.txt、_headers](./03-static-deployment.md)。
