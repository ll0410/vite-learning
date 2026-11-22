# 19. 生成 hash 版本文件和 CDN 上传清单

静态资源上传 CDN（内容分发网络）后，部署系统通常还要回答两个问题：这次构建到底是哪一版？每个本地文件应该上传到哪里、上传后的内容是否正确？

如果由上传脚本临时猜测带 hash 的文件名，或在上传前重新扫描整个 `dist`，很容易混入旧文件，也难以还原构建器已经整理好的产物关系。本例换一个思路：**在 Vite 写盘前直接读取本次构建的产物，为每个文件计算内容摘要，再生成版本文件和上传清单。**

这里的 SHA-256 可以理解为“内容指纹”：同一份字节会得到同一个 64 位十六进制字符串，内容变化后摘要也会变化。它用于校验和比对，不是加密，也不是从文件名里截取已有的 hash。

::: tip 现成方案速览
- **官方 / 成熟方案**：没有通用等价插件；`build.manifest` 只提供资源关系与哈希文件名，不提供完整内容 SHA-256 和 CDN 上传清单。通常与 CI 和 CDN 厂商 CLI/SDK 组合。
- **覆盖程度**：**无通用方案**。
- **本例定位**：教学用最小实现，重点是理解 `emitFile`、内容摘要和上传清单如何从本次构建产物生成。
- **值得自研的时机**：有明确的发布平台契约时；这部分本来就更适合放在发布脚本里。
:::

## 先看懂：插件在做什么

一句话概括：**`bundle` 是输入，两份 JSON 是生成结果，外部部署系统是消费者；插件本身不上传文件。**

```text
源码与静态资源
      ↓ Vite 生产构建：压缩、代码分割、占位符替换等
本次构建的 bundle
  ├─ JS chunk：读取 output.code
  └─ CSS、图片等 asset：读取 output.source
      ↓ 逐文件计算 SHA-256，再按路径排序
      ├─ version.json      → 逐文件摘要 + 整批版本号 + 构建时间
      └─ cdn-manifest.json → 本地相对路径 + CDN URL + 逐文件摘要
      ↓ 本仓库的实现到此为止
外部部署系统读取清单
  ├─ 比对版本、上传对象、跳过相同内容
  └─ 校验远端内容、记录发布并执行回滚
```

这里的几个术语分别对应：

- **chunk**：构建器拆分出来的 JS 产物，例如入口 JS、路由懒加载 JS，代码位于 `output.code`。
- **asset**：CSS、图片、JSON 等以静态内容输出的产物，内容位于 `output.source`，可能是字符串，也可能是 `Uint8Array` 表示的二进制字节。
- **bundle**：本次构建产物的内存集合。它的键是输出目录内的相对路径，例如 `assets/index-C1WrvEec.js`，不带 `dist/` 前缀。
- **版本号 `version`**：把所有纳入清单的“文件路径 + 文件摘要”再做一次 SHA-256 得到的整批标识，不是 Git commit，也不是某个 chunk 文件名中的 hash。

插件声明了 `apply: 'build'`，所以只在生产构建运行。开发服务器没有这份最终 `bundle`，本例也没有独立演示页面或上传接口；可观察结果就是构建后的 JSON 和它们对应的磁盘文件。

## 一个完整示例：从入口产物到部署清单

下面使用仓库现有 `dist` 中的一次真实构建说明数据怎样流动。示例只摘录少数字段和条目；产物文件名、内容摘要会随输入变化，`builtAt` 每次构建都会更新，应以本地重新构建的结果为准。

### 1. 输入：本次构建中的 chunk 和 asset

入口 HTML 最终引用了 `assets/index-C1WrvEec.js`。在这次构建的 `bundle` 中，与本例有关的输入可以这样理解：

| `bundle` 中的路径 | 类型 | 插件读取的内容 | 是否进入两份清单 |
| --- | --- | --- | --- |
| `assets/index-C1WrvEec.js` | chunk | `output.code` | 是 |
| `assets/index-Bl-LcrJZ.css` | asset | 字符串形式的 `output.source` | 是 |
| `assets/big-DAT-qnLn.png` | asset | `Uint8Array` 形式的 `output.source` | 是 |
| `lab-manifest.json` | asset | 前一个插件已经发射的 JSON 内容 | 是 |
| `index.html` | asset | HTML 内容 | 否，明确跳过 |
| `version.json` / `cdn-manifest.json` | asset | 清单内容 | 否，明确排除清单自身 |

关键点是“读取当前 `bundle`”，而不是根据 `dist/assets` 里有哪些文件反推本次产物。这样既能拿到尚未写盘的最终内容，也不会把上一轮构建遗留的文件算进去。

### 2. 生成结果一：`version.json` 记录整批版本

对入口 CSS 和 JS 计算摘要后，它们会成为 `files` 对象中的两个键值对。所有条目再共同参与整批 `version` 的计算：

```jsonc
{
  "version": "ed894f5cc275c6d0617a0fb299fa38d38b19192b9e1642a232835ba51c041fb3",
  "algorithm": "sha256",
  "builtAt": "2026-11-21T03:53:32.662Z",
  "files": {
    "assets/index-Bl-LcrJZ.css": "22854bf7592b30cfff7af81db05459d6d089a7993fc1a4e04a3b5b51d2228422",
    "assets/index-C1WrvEec.js": "9f399c98a43e901470049091e97645e22e97d571220d0be32b626056cc10a252"
    // ……其余条目已省略
  }
}
```

三个顶层字段各有分工：

- `files` 用来回答“某个文件的摘要是什么”。
- `version` 用来回答“这一整批纳入清单的产物是否发生变化”。文件内容变化、文件增删或路径变化，都会改变它。
- `builtAt` 只是构建时间，不参与 `version` 计算。因此输入产物不变时，再次构建会得到相同的 `version`，但 `builtAt` 不同。

### 3. 生成结果二：`cdn-manifest.json` 提供上传所需字段

同一份逐文件摘要还会转换成数组，并补上完整 URL：

```jsonc
{
  "baseUrl": "https://cdn.example.com/",
  "files": [
    {
      "path": "assets/index-Bl-LcrJZ.css",
      "url": "https://cdn.example.com/assets/index-Bl-LcrJZ.css",
      "sha256": "22854bf7592b30cfff7af81db05459d6d089a7993fc1a4e04a3b5b51d2228422"
    },
    {
      "path": "assets/index-C1WrvEec.js",
      "url": "https://cdn.example.com/assets/index-C1WrvEec.js",
      "sha256": "9f399c98a43e901470049091e97645e22e97d571220d0be32b626056cc10a252"
    }
    // ……其余条目已省略
  ]
}
```

两个文件不是各自独立计算：它们都来自同一个排序后的 `hashes` 集合，所以同一路径的摘要必然一致。数组顺序也稳定，重复构建同一份输入时更容易做文本 diff。

### 4. 消费者：部署系统按字段执行，而不是页面直接 import

本仓库没有实现上传脚本，也没有业务页面读取这两个 JSON。它们面向的是仓库之外的部署系统，字段契约如下：

| 消费方 | 读取内容 | 可以执行的动作 |
| --- | --- | --- |
| CI（持续集成）/ 发布系统 | `version.version`、`version.files` | 比较两次构建、标记发布批次、辅助灰度与回滚 |
| 上传脚本 | `files[].path` | 从 `dist` 下定位本地文件，并作为远端对象相对路径 |
| 上传脚本 / CDN 配置 | `files[].url` | 确定上传后的访问 URL，或生成缓存刷新任务 |
| 上传与校验流程 | `files[].sha256` | 比对本地和远端内容，跳过相同对象，辅助断点续传后的校验，发现损坏或不一致 |

`cdn.example.com` 是 RFC 2606 保留的示例域名。插件只拼出 URL，**不会发起上传、缓存刷新或任何其他网络请求**。浏览器也不会因为存在这份清单就自动从 CDN 加载资源；要让页面使用 CDN，还需要部署系统或资源 URL 配置配合。

### 5. 构建结果：两份清单与其他产物一起写入 `dist`

`this.emitFile` 把两份 JSON 作为新 asset 交回构建器，因此不需要插件自己调用文件系统写盘。最终目录的关系如下（结构摘选）：

```text
dist/
├─ assets/
│  ├─ index-C1WrvEec.js       # 已纳入清单
│  ├─ index-C1WrvEec.js.gz    # 更晚生成，不在本次清单中
│  └─ index-C1WrvEec.js.br    # 更晚生成，不在本次清单中
├─ index.html                 # 明确排除，随后由 SRI 插件改写
├─ robots.txt                 # 更晚生成，不在本次清单中
├─ _headers                   # 更晚生成，不在本次清单中
├─ version.json
└─ cdn-manifest.json
```

所以，`version` 是**当前钩子执行时已纳入集合的产物版本**，并不是整个 `dist` 目录的完整指纹。只修改 HTML、`robots.txt`、`_headers` 或压缩产物，不会改变当前实现算出的 `version`。

## 核心原理：看完输出，再回头看钩子

完整实现位于 `plugins/build-output/deployment-artifacts.ts`。下面按执行顺序拆开说明；代码摘录省略了插件对象外层、类型接口和注释，保留真实函数名、字段与处理逻辑。

### 1. `apply: 'build'`：把作用范围限制在生产构建

`deploymentArtifactsPlugin()` 返回名为 `lab:build-output:deployment-artifacts` 的插件，并声明 `apply: 'build'`。它不需要 dev 中间件，也不会因为启动开发服务器而扫描目录或生成文件。

### 2. `generateBundle`：直接读取写盘前的产物内容

插件首先定义一个同时支持文本和二进制输入的摘要函数：

```ts
function sha256(source: string | Uint8Array): string {
  return createHash('sha256').update(source).digest('hex')
}
```

`createHash` 来自 Node 内置的 `node:crypto`。把 `Uint8Array` 交给它，就能直接对原始字节计算摘要，不必把图片等二进制内容解码成 UTF-8 字符串。

随后在 `generateBundle` 中遍历 `bundle`：

```ts
const hashes = new Map<string, string>()

for (const [fileName, output] of Object.entries(bundle)) {
  if (fileName.endsWith('.html') || MANIFEST_FILES.has(fileName)) continue

  const source = output.type === 'asset' ? output.source : output.code
  hashes.set(fileName, sha256(source))
}
```

这里同时完成三件事：

1. 用 `fileName` 保留输出目录内的相对路径。
2. 用 `output.type` 选择 chunk 的 `code` 或 asset 的 `source`。
3. 跳过 HTML 与 `MANIFEST_FILES` 中的 `version.json`、`cdn-manifest.json`。

排除清单自身可以避免把旧清单或自我引用纳入版本；排除 HTML 则是因为后续的 `staticDeploymentPlugin()` 还会给 HTML 中的 `<script>` / `<link>` 添加 SRI（子资源完整性）属性。若现在记录 HTML 摘要，写盘时它已经过期。HTML 的缓存由后续生成的 `_headers` 单独控制，例如 `Cache-Control: public, max-age=0, must-revalidate`，也可以由部署层使用 ETag（服务器提供的资源验证标识），而不是靠这份不可变资源清单处理。

### 3. 排序并二次哈希：得到可复算的整批版本

```ts
const sorted = [...hashes.entries()].sort(([a], [b]) => a.localeCompare(b))
const version = sha256(sorted.map(([file, hash]) => `${file}:${hash}`).join('\n'))
```

参与第二次哈希的文本形如：

```text
assets/index-Bl-LcrJZ.css:22854bf7592b30cfff7af81db05459d6d089a7993fc1a4e04a3b5b51d2228422
assets/index-C1WrvEec.js:9f399c98a43e901470049091e97645e22e97d571220d0be32b626056cc10a252
```

这里也把路径放进输入，因此“内容相同但文件改名”同样会改变版本。先排序再拼接，避免 `bundle` 的遍历顺序影响结果；`version` 可以完全由 `version.files` 复算，后面的验证脚本会检查这一点。

### 4. 构造两种视图，再用 `this.emitFile` 发射

`versionFile` 适合按路径查询和比较整批版本，`cdnManifest` 适合上传脚本逐项遍历：

```ts
const versionFile = {
  version,
  algorithm: 'sha256',
  builtAt: new Date().toISOString(),
  files: Object.fromEntries(sorted),
}

const cdnManifest = {
  baseUrl: CDN_BASE_URL,
  files: sorted.map<CdnFile>(([file, hash]) => ({
    path: file,
    url: new URL(file, CDN_BASE_URL).href,
    sha256: hash,
  })),
}

this.emitFile({
  type: 'asset',
  fileName: 'version.json',
  source: `${JSON.stringify(versionFile, null, 2)}\n`,
})
this.emitFile({
  type: 'asset',
  fileName: 'cdn-manifest.json',
  source: `${JSON.stringify(cdnManifest, null, 2)}\n`,
})
```

`CDN_BASE_URL` 在真实源码中固定为 `https://cdn.example.com/`。`new URL(file, CDN_BASE_URL)` 使用 URL 语义拼接路径，不要用操作系统的文件路径 API 拼 URL。

可以按下表回到完整源码：

| 要理解的步骤 | 源码位置 | 作用 |
| --- | --- | --- |
| 限制构建阶段 | `deploymentArtifactsPlugin()` 的 `apply` | 只在 build 中运行 |
| 计算文本或二进制摘要 | `sha256` | 输出 64 位十六进制 SHA-256 |
| 选择并过滤产物 | `generateBundle.handler` | 读取 `code` / `source`，跳过 HTML 和清单自身 |
| 计算整批版本 | `sorted` 和 `version` | 稳定排序后对“路径:摘要”列表二次哈希 |
| 生成两种 JSON 视图 | `versionFile`、`cdnManifest` | 分别服务版本比对和上传遍历 |
| 把清单交给构建器 | 两次 `this.emitFile` | 与其他产物统一写盘 |

## 配置接入：顺序和钩子阶段同样重要

插件已经由 `plugins/build-output/index.ts` 中的 `buildOutputPlugins()` 注册：

```ts
return [
  replaceBuiltAssetsPlugin(),
  ssrManifestPlugin(),
  deploymentArtifactsPlugin(),
  staticDeploymentPlugin(),
]
```

`vite.config.ts` 再通过 `...buildOutputPlugins()` 展开到 `plugins` 数组。当前 `build.outDir` 是 `dist`，`build.assetsDir` 是 `assets`，所以清单里的 `assets/...` 可以直接映射到 `dist/assets/...`。

### 为什么必须使用 `order: 'post'`

真实实现不是简单的 `generateBundle(_options, bundle)`，而是：

```ts
generateBundle: {
  order: 'post',
  handler(_options, bundle) {
    // 读取产物、计算摘要并发射两份清单
  },
},
```

`post` 表示在这个钩子的后置阶段执行。Vite 的部分产物（例如异步 chunk 关联的 CSS）以及 HTML，要到更晚阶段才会定稿或进入 `bundle`。在普通阶段过早计算，可能漏掉产物或记录旧内容。

但只写 `post` 还不够：**同一阶段内仍按插件数组顺序执行。** 当前顺序保证了：

1. `replaceBuiltAssetsPlugin()` 先替换 chunk / asset 中的占位域名，清单记录替换后的内容。
2. `ssrManifestPlugin()` 先发射 `lab-manifest.json`，因此它也会进入本次哈希集合。
3. `deploymentArtifactsPlugin()` 计算摘要并发射两份清单。
4. `staticDeploymentPlugin()` 最后改写 HTML、添加 SRI，并发射 `robots.txt` 与 `_headers`，所以这些后产生的文件不在清单里。

`vite-plugin-compression2` 在 `vite.config.ts` 中注册得更晚，同在后置阶段时按这个顺序生成 `.gz` / `.br`，所以压缩文件也不在两份清单中。清单 JSON 自己随后可能被压缩成 `.json.gz` / `.json.br`，但这些压缩副本同样不会被清单收录。

本例没有新增路由、业务页面或 dev 中间件：`src/plugin-lab/routes/build-output.ts` 是空数组，`src/plugin-lab/catalog/build-output.ts` 只把本条目标记为 `buildOnly` 并提供教程入口。分类页上的“构建验证”标签不是运行结果，仍须执行下面的构建断言。

## 验证步骤

### 1. 构建并逐文件核对，而不是只抽查一个 JS

在仓库根目录运行：

```bash
pnpm build
node --input-type=module - <<'NODE'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const version = JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8'))
const cdn = JSON.parse(readFileSync(join(dist, 'cdn-manifest.json'), 'utf8'))
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
const manifestFiles = new Set(['version.json', 'cdn-manifest.json'])

if (version.algorithm !== 'sha256') throw new Error('摘要算法应为 sha256')
if (!/^[a-f0-9]{64}$/.test(version.version)) throw new Error('version 应为 64 位十六进制摘要')
if (cdn.baseUrl !== 'https://cdn.example.com/') throw new Error('示例 baseUrl 不正确')

const cdnPaths = new Set()
for (const file of cdn.files) {
  if (cdnPaths.has(file.path)) throw new Error(`清单路径重复: ${file.path}`)
  if (file.url !== new URL(file.path, cdn.baseUrl).href) throw new Error(`URL 拼接错误: ${file.url}`)
  if (file.path.startsWith('/') || file.path.includes('..') || file.path.startsWith('dist/')) {
    throw new Error(`清单包含非法路径: ${file.path}`)
  }
  if (file.path.endsWith('.html') || manifestFiles.has(file.path)) {
    throw new Error(`不应纳入清单: ${file.path}`)
  }
  if (/\.(?:gz|br)$/.test(file.path)) throw new Error(`压缩副本不应纳入当前清单: ${file.path}`)
  if (!existsSync(join(dist, file.path))) throw new Error(`清单文件不存在: ${file.path}`)
  if (version.files[file.path] !== file.sha256) throw new Error(`两份清单哈希不一致: ${file.path}`)
  cdnPaths.add(file.path)
}

if (cdnPaths.size !== Object.keys(version.files).length) throw new Error('两份清单文件数量不一致')
for (const lateFile of ['robots.txt', '_headers']) {
  if (cdnPaths.has(lateFile)) throw new Error(`后生成文件不应纳入当前清单: ${lateFile}`)
}

// 用最终磁盘字节逐文件重算，能发现插件顺序或后续改写造成的过期摘要。
for (const file of cdn.files) {
  const actual = sha256(readFileSync(join(dist, file.path)))
  if (actual !== file.sha256) throw new Error(`哈希不一致: ${file.path}`)
}

const sorted = Object.entries(version.files).sort(([a], [b]) => a.localeCompare(b))
const expectedOrder = sorted.map(([file]) => file)
if (cdn.files.some((file, index) => file.path !== expectedOrder[index])) {
  throw new Error('cdn-manifest.json 未按路径稳定排序')
}

const recomputed = sha256(sorted.map(([file, hash]) => `${file}:${hash}`).join('\n'))
if (recomputed !== version.version) throw new Error('version 标识无法由 files 复算')

console.log(`deployment OK: ${cdn.files.length} files, version=${version.version.slice(0, 12)}`)
NODE
```

预期结果：

- `pnpm build` 成功，`dist/version.json` 与 `dist/cdn-manifest.json` 都存在。
- Node 脚本无报错，最后输出 `deployment OK: <N> files, version=<12 位十六进制>`；`N` 是本次实际纳入清单的文件数，不是固定值。
- 每条 `url` 都能由 `baseUrl + path` 的 URL 语义复算，每份摘要都与最终磁盘内容一致；HTML、清单自身、后生成的静态配置文件和压缩副本均不在清单里。
- 若插件顺序错误、漏收文件或产物随后被改写，脚本会以非零状态退出，并打印对应路径或字段，而不是只验证“JSON 能打开”。

### 2. 手动抽查一个带 hash 的资源

```bash
shasum -a 256 dist/assets/index-*.js
```

预期结果：命令输出的 64 位摘要，与 `version.json` 的 `files` 中同一路径的值一致，也与 `cdn-manifest.json` 对应条目的 `sha256` 一致。若有多个匹配文件，要按完整文件名逐一对应，不能只比较文件名里的 hash。

### 3. 可选：通过本地 preview 检查清单可被静态服务读取

在默认 `base: '/'` 的构建下运行：

```bash
pnpm exec vite preview --port 5319 --strictPort
# 在另一个终端执行
curl http://localhost:5319/version.json
curl http://localhost:5319/cdn-manifest.json
```

预期结果：两个本地请求都返回前面验证过的 JSON。这里验证的是 `dist` 的静态服务结果，**不代表 `cdn.example.com` 上已经存在资源**。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 生产级部署还需补齐

- **真实上传流程**：由受控部署脚本读取清单，处理鉴权、并发、超时、重试和回滚；逐项比对远端摘要并跳过相同对象。通常先上传不可变资源，确认可用后再发布引用它们的 HTML。
- **版本覆盖范围**：当前 `version` 不包含 HTML、`robots.txt`、`_headers` 和压缩副本，不能直接当作整个站点的发布指纹。若发布系统要求“任何部署文件变化都改变版本”，应在所有内容改写完成后重新定义纳入范围并生成版本。
- **路径前缀**：`CDN_BASE_URL` 应从环境变量或插件参数读取，并与 Vite `base`、CDN 对象键规则一起设计。当前硬编码值不会自动继承 `GITHUB_PAGES=true` 时的 `/vite-learning/` 前缀。
- **URL 末尾斜杠**：`baseUrl` 必须按目录语义保留末尾 `/`。例如 `new URL('assets/a.js', 'https://cdn.example.com/cdn')` 会丢掉最后一段 `cdn`，而 `https://cdn.example.com/cdn/` 才会得到 `/cdn/assets/a.js`。
- **预压缩产物**：若 CDN 需要上传 `.gz` / `.br`，应在压缩插件之后另行收集，并同时处理对象元数据和 `Content-Encoding`，不能假定当前清单已经覆盖它们。
- **签名与供应链校验**：可对 `cdn-manifest.json` 签名，或把摘要写入 CI 构建制品的元数据，避免构建结束后、上传开始前清单被篡改。
- **可复现构建**：`builtAt` 会使 `version.json` 的字节随构建时间变化。若要求字节级可复现，可读取 `SOURCE_DATE_EPOCH`、CI 构建号，或把时间移到不参与发布的元数据中；这不影响当前 `version` 的复算规则。
- **发布标识**：内容版本不等于 Git 历史。需要按 commit 定位源码或执行回滚时，应额外记录 commit SHA、流水线编号和制品存储位置。

:::

::: details 常见坑

- **只在普通 `generateBundle` 阶段计算**：异步 CSS 等产物可能尚未定稿。必须使用当前的 `post` 配置，并用最终磁盘字节逐文件复算，不能只抽查几个 JS。
- **算完摘要后又改写同一文件**：清单会立即过期。所有会修改已纳入产物的插件都应排在哈希插件之前；HTML 是主动排除的例外，由后续 SRI 与缓存配置单独处理。
- **把 `version` 当成整个 `dist` 的摘要**：后生成的 `_headers`、`robots.txt`、`.gz` / `.br` 和明确排除的 HTML 都不在当前计算范围内。
- **在钩子中扫描整个 `dist`**：可能混入上一轮遗留文件，而且 `generateBundle` 执行时本次文件尚未统一写盘。应以 `bundle` 为准，通过 `this.emitFile` 添加清单。
- **把所有 asset 都转成字符串**：二进制内容经过 UTF-8 解码后可能改变字节。当前 `sha256(source)` 同时接受字符串和 `Uint8Array`，应直接传入原始内容。
- **用 `path.join(baseUrl, file)` 拼 URL**：文件路径 API 会受操作系统分隔符影响，例如 Windows 可能产生反斜杠，也不具备正确的 URL 解析语义。当前实现使用 `new URL(file, CDN_BASE_URL)`。
- **忘记排除清单自身**：把 `version.json` 或 `cdn-manifest.json` 纳入自身版本会形成自我引用，也可能误用旧清单内容。
- **混淆部署摘要与 SRI**：本插件用 SHA-256 十六进制摘要供部署比对；下一篇的 SRI 使用 SHA-384 Base64 摘要供浏览器校验，二者用途和编码都不同。
- **把示例域名当成已完成的 CDN 接入**：生成 URL 不会上传文件，也不会自动改变 HTML 的资源地址；真实上线必须由部署流水线完成。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；相邻产物处理可继续阅读 [SRI 与静态部署文件](./03-static-deployment.md) 和 [替换产物中的占位域名](./04-replace-built-assets.md)。
