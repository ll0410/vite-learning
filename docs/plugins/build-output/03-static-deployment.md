# 20. 生成 SRI、robots.txt、_headers

静态站点构建完成后，浏览器、搜索引擎和托管平台需要的东西并不相同：浏览器需要确认 JS/CSS 没有被替换，搜索引擎需要抓取规则，托管平台需要响应头配置。本例在**产物写盘前**一次性准备好这三类结果。

::: tip 现成方案速览
- **官方 / 成熟方案**：SRI 用 [`vite-plugin-sri3`](https://github.com/yoyo930021/vite-plugin-sri3)（声明并测试 Vite 8）；`robots.txt`、`_headers` 直接放 `public/`，需要复制时转换则用 [`vite-plugin-static-copy`](https://github.com/sapphi-red/vite-plugin-static-copy)（声明支持 Vite 6–8）。
- **覆盖程度**：**部分覆盖**（拆成几个现成方案组合）。
- **本例定位**：教学用最小实现，重点是理解为什么要在 post 阶段处理，以及文件生成顺序为何影响结果。
- **值得自研的时机**：需要与压缩、CDN 上传顺序强绑定，或 SRI 覆盖范围超出插件能力时。
:::

## 先看懂：插件在做什么

一句话概括：**Vite 已生成的 HTML 和本地 JS/CSS 是输入，带完整性摘要的 HTML、`robots.txt` 和 `_headers` 是输出，三类消费者各取所需。**

这里的 **SRI（Subresource Integrity，子资源完整性）**，是让浏览器把下载到的资源内容算成摘要，再与 HTML 中的 `integrity` 属性比对；不一致就拒绝执行脚本或应用样式。它发现的是“资源字节是否与构建时一致”，不是一套登录或权限机制。

```text
index.html + admin.html
        ↓ Vite 构建
内存 bundle 中的 HTML、JS、CSS
        ↓ staticDeploymentPlugin()
        ├─ 改写 index.html / admin.html
        │    └─ 为 bundle 内的脚本和样式引用补 integrity + crossorigin
        ├─ 生成 robots.txt ───────→ 搜索引擎读取抓取规则
        └─ 生成 _headers ────────→ 支持的托管平台读取响应头规则

带 integrity 的 HTML ───────────→ 浏览器下载 JS/CSS 后核对摘要
```

`bundle` 可以先理解成“构建器在写盘前交给插件的一张产物表”：键是相对于 `dist` 的文件名，值是产物内容。JS 产物称为 `chunk`，HTML、CSS、图片等产物称为 `asset`。

本插件声明了 `apply: 'build'`，只处理生产构建。开发服务器没有同一组最终 chunk 和 HTML 产物，所以本例没有新增页面或路由；`src/plugin-lab/routes/build-output.ts` 中的 `buildOutputRoutes` 也是空数组。验收对象是 `dist`，不是某个 dev 示例面板。

## 第一个完整示例：给 Admin 入口资源加上 SRI

### 1. 输入：两个 HTML 入口和它们引用的产物

主入口是根目录的 `index.html`，第二个入口是 `admin.html`。后者包含一条真实的业务入口引用：

```html
<!-- admin.html -->
<script type="module" src="/src/mpa/admin.ts"></script>
```

`plugins/html/mpa-entry.ts` 中的 `mpaEntry()` 已在构建时把 `index.html` 和 `admin.html` 都注册为输入，因此 Vite 会生成两份 HTML。`src/mpa/admin.ts` 则读取注入的 meta，更新页面中的入口标识和标题；本插件不改变这些业务逻辑。

构建后，`/src/mpa/admin.ts` 已经变成带内容哈希的 JS 文件，HTML 还会出现共享的 `modulepreload` 引用。**“modulepreload”是让浏览器提前加载后续会用到的 ES 模块。**这些新生成的 URL 才是本插件的输入，源码里的 `/src/mpa/admin.ts` 不会被直接拿来计算部署文件的摘要。

### 2. 转换结果：HTML 引用与产物摘要绑定

当前 `dist/admin.html` 中由本插件处理的两条引用如下。文件名和摘要都来自真实产物；以后资源内容变化时，两者也会随之变化：

```html
<script type="module" src="/assets/admin-D6h3ND5y.js" integrity="sha384-3QwRAJyOcFS37VnlqMjTkR5cpIq4pKmj4DVKk1UjSoCVUa79fvRTb09JKEAJ3yOk" crossorigin="anonymous"></script>
<link rel="modulepreload" href="/assets/modulepreload-polyfill-P2Xu9kJm.js" integrity="sha384-lW8evexVVsS3LQfRZqts25dC1ZOvsemvMXNJkZ5TbhhyRqEiUFMRgJjQ8vprkme5" crossorigin="anonymous">
```

`sha384-` 后面的内容是资源经过 **SHA-384（一种计算固定长度摘要的算法）**得到的摘要，再用 Base64 编码成的文本。`crossorigin="anonymous"` 表示使用匿名的 **CORS（跨域资源共享，浏览器允许一个站点读取另一个站点资源的机制）**模式，不携带跨域凭据；如果资源在跨域 CDN（内容分发网络）上，CDN 还必须返回允许该站点读取的 CORS 响应头。

当前两个 HTML 的处理数量是：

| HTML 产物 | 被补 SRI 的引用 | 数量 |
| --- | --- | ---: |
| `index.html` | 入口 JS、两个 modulepreload JS、入口 CSS | 4 |
| `admin.html` | Admin 入口 JS、共享 modulepreload JS | 2 |

两个页面共享同一个 `modulepreload-polyfill` 文件，也就是为不支持模块预加载的环境补足能力的兼容脚本。插件用 `integrityCache` 按产物文件名缓存结果，因此同一个文件被多个标签或多个 HTML 引用时，不必重复计算摘要。

### 3. 消费与页面结果：匹配才执行，不匹配就阻断

浏览器请求这些 JS/CSS 后会独立计算摘要。匹配时，Admin 脚本正常执行，页面显示入口标识 `admin` 和标题 `Vite 插件实验室 · Admin`；如果文件被换掉而 HTML 没更新，摘要不匹配，浏览器会拒绝使用该资源，并在控制台报告完整性校验错误。

并不是 HTML 里的所有标签都会被处理。本例只改写能够映射回本次 `bundle` 的 `.js`、`.mjs` 和 `.css` 引用：

| 标签或 URL | 是否处理 | 原因 |
| --- | --- | --- |
| 带 `src` 的本地构建脚本 | 是 | 能在 `bundle` 中找到对应 chunk |
| `rel="stylesheet"` 的本地构建 CSS | 是 | 能在 `bundle` 中找到对应 asset |
| `rel="modulepreload"` 的本地构建 JS | 是 | 同样对应本次 JS chunk |
| `/plugin-lab/cdn-stub.js` 等 public 脚本 | 否 | public 文件被复制到 `dist`，但不是这里可查询的 bundle 条目 |
| 外链、data URL | 否 | `integrityFor` 明确跳过 |
| icon、preconnect 等其他 link | 否 | `rel` 或扩展名不在处理范围内 |
| 没有 `src` 的内联脚本 | 否 | 没有可供 SRI 下载校验的独立资源 |

所以，验证时不能只数“HTML 里有多少个 script”，还要确认它是否属于本插件的处理范围。

## 第二个完整示例：生成抓取规则和托管响应头

### 1. 生成结果：`robots.txt` 与 `_headers`

处理完 HTML 后，插件通过 `this.emitFile` 向本次构建追加两个 asset。`emitFile` 的意思是“把文件交给构建器统一写盘”，不是插件自己调用 `readFileSync` 或 `writeFileSync` 扫描、改写 `dist`。

`dist/robots.txt` 的完整内容是：

```text
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
```

`dist/_headers` 的内容如下。HTML 规则的顺序来自 `bundle` 的遍历顺序，不影响规则含义：

```text
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/admin.html
  Cache-Control: public, max-age=0, must-revalidate

/index.html
  Cache-Control: public, max-age=0, must-revalidate
```

这里有三条全局安全响应头，以及两类缓存策略：

- `/assets/*` 中的文件名带内容哈希，内容变化会得到新 URL，因此可以缓存一年，并用 `immutable` 告诉浏览器在有效期内不必重新验证。
- HTML 文件名固定，内容却可能引用新一批资源，所以使用 `max-age=0, must-revalidate`：浏览器可以保存响应，但每次使用前都要重新验证。它不等于 `no-store`，不是“完全禁止缓存”。

### 2. 消费者不同，生效方式也不同

| 产物 | 消费者 | 怎样生效 |
| --- | --- | --- |
| 带 `integrity` 的 HTML | 浏览器 | 下载对应 JS/CSS 后核对摘要 |
| `robots.txt` | 搜索引擎爬虫 | 作为站点根路径下的抓取规则被请求 |
| `_headers` | Netlify、Cloudflare Pages 等支持该文件约定的平台 | 部署平台读取规则，并在响应中设置对应 HTTP 头 |

`_headers` 不是浏览器自动请求的业务文件，也不是所有平台都认识的通用标准。`vite preview` 只负责预览静态产物，不会按这份文件设置响应头；验证响应头必须部署到支持它的平台，或使用与目标平台一致的本地网关。

另外，`https://example.com/sitemap.xml` 是源码中固定的示例地址，插件不会生成 sitemap，也不会访问网络。真实部署前必须替换为自己的站点地址。

## 核心原理：为什么要在 post 阶段处理

看完结果，再回到 `staticDeploymentPlugin()` 的关键钩子：

```ts
generateBundle: {
  order: 'post',
  handler(_options, bundle) {
    // 读取并改写 bundle，再 emitFile 新产物；此处省略具体处理。
  },
}
```

`generateBundle` 在产物已经生成、尚未写盘时执行，适合根据真实产物内容生成或修改文件。`order: 'post'` 表示进入这个钩子的后置批次：Vite 的 HTML 插件在这个阶段才把 `index.html`、`admin.html` 放进 `bundle`，普通阶段通常只能看到 JS/CSS 等产物，直接寻找 HTML 会一无所获。

在同一个 `post` 批次内，插件仍按注册顺序执行。因此“使用 post”与“排在哪个插件后面”是两件事，两者都要正确。

### 从 HTML URL 找到产物，再计算摘要

`integrityFor` 完成了这条转换链。下面截取其中的核心段落，省略函数声明以及外链、data URL 判断；保留的语句与真实源码一致：

```ts
const fileName = url.split(/[?#]/)[0].replace(/^\/+/, '')
if (!/\.(?:m?js|css)$/i.test(fileName)) return undefined

const cached = integrityCache.get(fileName)
if (cached) return cached

const output = bundle[fileName]
if (!output) return undefined

const source = output.type === 'asset' ? output.source : output.code
const integrity = `${SRI_ALGORITHM}-${createHash(SRI_ALGORITHM).update(source).digest('base64')}`
integrityCache.set(fileName, integrity)
return integrity
```

例如，HTML 中的 `/assets/admin-D6h3ND5y.js` 去掉开头的 `/` 后，就是 `bundle` 键 `assets/admin-D6h3ND5y.js`。查询串（`?` 后的参数）和 hash（`#` 后的片段）不属于磁盘文件名，所以要先移除。JS chunk 从 `output.code` 取内容，CSS 等 asset 从 `output.source` 取内容；两者都直接交给 Node 的 `crypto.createHash('sha384')`，无需先写盘再读回。

在进入这段逻辑前，`integrityFor` 还会跳过外链和 data URL。找不到对应 `bundle` 条目时同样返回 `undefined`，让原标签保持不变，而不是猜一个哈希。

### HTML 是怎样被改写的

插件遍历 `bundle` 中所有 `.html` asset，并用两条替换链分别处理 `<script>` 和 `<link>`。辅助函数的职责如下：

| 源码函数或变量 | 作用 |
| --- | --- |
| `readAttribute` | 从 Vite 生成的标签中读取双引号属性，如 `src`、`href`、`rel` |
| `integrityFor` | 过滤 URL、查找产物、计算并缓存 `sha384-...` |
| `withIntegrity` | 先移除旧 `integrity` / `crossorigin`，再追加新值，避免重复属性 |
| `integrityCache` | 让共享资源只计算一次摘要 |
| `htmlFiles` | 收集实际处理到的 HTML 文件名，用于逐项生成 `_headers` 缓存规则 |
| `ROBOTS_TXT` | 提供 `robots.txt` 的固定文本 |

改写发生在内存中的 `output.source` 上。最后两次 `this.emitFile` 分别生成 `robots.txt` 和 `_headers`，与其他产物一起写入 `dist`。完整实现位于 `plugins/build-output/static-deployment.ts`，插件不读取线上资源，也不扫描上一轮 `dist`。

## 配置接入与执行顺序

插件由 `plugins/build-output/index.ts` 中的 `buildOutputPlugins()` 注册，真实顺序是：

```ts
return [
  replaceBuiltAssetsPlugin(),
  ssrManifestPlugin(),
  deploymentArtifactsPlugin(),
  staticDeploymentPlugin(),
]
```

`vite.config.ts` 通过 `...buildOutputPlugins()` 展开这组插件，并在更后面注册压缩插件：

```ts
compression({
  algorithms: ['gzip', 'brotliCompress'],
  threshold: 1024,
})
```

这条顺序链保证了各插件看到的是正确内容：

1. `replaceBuiltAssetsPlugin()` 先替换 JS/CSS 等产物中的占位域名；后续摘要基于替换后的内容。
2. `deploymentArtifactsPlugin()` 在 post 阶段生成版本哈希和 CDN 清单，并明确跳过之后还会被改写的 HTML。
3. `staticDeploymentPlugin()` 改写 HTML、计算 JS/CSS 的 SRI，并生成两个静态部署文件。
4. 更晚注册的 `vite-plugin-compression2` 在 post 阶段为达到 1024 字节阈值的产物生成 `.gz` / `.br`，因此压缩的是**已经带 SRI 的最终 HTML**。

`admin.html` 和 `src/mpa/admin.ts` 由 [MPA（多页应用）入口示例](../html-injection/03-mpa-entry.md) 提供；本插件只处理构建后的两个 HTML，没有新增业务组件、路由或 dev 中间件。

## 验证步骤

### 1. 构建并用 Node 独立复算

> 以下断言面向当前完整仓库，依赖 `index.html`、`admin.html` 以及现有引用数量。若只裁剪出本分类，请先保留 MPA 示例提供的 `admin.html`；如果有意增删入口资源，也要同步调整 `expectedCounts`。

运行：

```bash
pnpm build
```

预期首先能在 `dist` 中看到 `index.html`、`admin.html`、`robots.txt` 和 `_headers`。当前两个 HTML 都超过压缩阈值，还应存在对应的 `.html.gz` 和 `.html.br`。

随后执行下面的断言。它只检查 `build.assetsDir = 'assets'` 下、且属于本插件处理范围的构建引用，避免把三个 public stub 脚本误判为漏加 SRI：

```bash
node --input-type=module - <<'NODE'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'

const dist = 'dist'
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1]
const expectedCounts = new Map([
  ['index.html', 4],
  ['admin.html', 2],
])

for (const [htmlFile, expectedCount] of expectedCounts) {
  const htmlPath = join(dist, htmlFile)
  if (!existsSync(htmlPath)) throw new Error(`缺少 HTML: ${htmlFile}`)

  const html = readFileSync(htmlPath, 'utf8')
  const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>/gi)].map((match) => match[0])
  let checked = 0

  for (const tag of tags) {
    const isScript = tag.toLowerCase().startsWith('<script')
    const rel = attr(tag, 'rel')?.toLowerCase()
    if (isScript && !attr(tag, 'src')) continue
    if (!isScript && rel !== 'stylesheet' && rel !== 'modulepreload') continue

    const url = attr(tag, 'src') ?? attr(tag, 'href')
    if (!url) continue
    const file = url.split(/[?#]/)[0].replace(/^\/+/, '')

    // 当前 Vite 配置把构建 JS/CSS 放在 assets；public 脚本不在本插件的处理范围内。
    if (!file.startsWith('assets/') || !/\.(?:m?js|css)$/i.test(file)) continue

    const integrity = attr(tag, 'integrity')
    if (!integrity?.startsWith('sha384-')) throw new Error(`${htmlFile} 缺少 SRI: ${url}`)
    if (attr(tag, 'crossorigin') !== 'anonymous') {
      throw new Error(`${htmlFile} 缺少 crossorigin="anonymous": ${url}`)
    }

    const actual = `sha384-${createHash('sha384').update(readFileSync(join(dist, file))).digest('base64')}`
    if (actual !== integrity) throw new Error(`${htmlFile} SRI 与产物不一致: ${url}`)
    checked++
  }

  if (checked !== expectedCount) {
    throw new Error(`${htmlFile} 应校验 ${expectedCount} 个引用，实际 ${checked} 个`)
  }

  const gzPath = `${htmlPath}.gz`
  if (!existsSync(gzPath)) throw new Error(`缺少压缩产物: ${htmlFile}.gz`)
  const compressed = gunzipSync(readFileSync(gzPath)).toString('utf8')
  if (compressed !== html) {
    throw new Error(`${htmlFile}.gz 与最终 HTML 不一致（HTML 改写晚于压缩）`)
  }

  console.log(`SRI OK: ${htmlFile} (${checked} 个引用，gzip 一致)`)
}

const robots = readFileSync(join(dist, 'robots.txt'), 'utf8')
const expectedRobots = `User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n`
if (robots !== expectedRobots) throw new Error('robots.txt 内容不正确')

const headers = readFileSync(join(dist, '_headers'), 'utf8')
for (const line of [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'X-Frame-Options: DENY',
]) {
  if (!headers.includes(line)) throw new Error(`_headers 缺少安全头: ${line}`)
}
if (!headers.includes('/assets/*\n  Cache-Control: public, max-age=31536000, immutable')) {
  throw new Error('_headers 缺少带哈希资源的缓存规则')
}
for (const htmlFile of expectedCounts.keys()) {
  if (!headers.includes(`/${htmlFile}\n  Cache-Control: public, max-age=0, must-revalidate`)) {
    throw new Error(`_headers 缺少 ${htmlFile} 缓存规则`)
  }
}

console.log('static deploy files OK')
NODE
```

当前完整仓库的预期输出是：

```text
SRI OK: index.html (4 个引用，gzip 一致)
SRI OK: admin.html (2 个引用，gzip 一致)
static deploy files OK
```

这里的断言不是读取插件自己写的另一份清单来自证，而是重新读取磁盘上的 JS/CSS、独立计算 SHA-384，并解压 `.html.gz` 对照最终 HTML。涉及内容改写或压缩的顺序错误，以及摘要不一致，都会让脚本以非零状态退出。

### 2. 用 preview 检查浏览器结果

```bash
pnpm exec vite preview --port 5320 --strictPort
```

打开 `http://localhost:5320/` 和 `http://localhost:5320/admin.html`。预期结果是：

- 主单页应用（SPA）正常加载，控制台没有 SRI 校验失败信息。
- Admin 页面显示入口标识 `admin` 和标题 `Vite 插件实验室 · Admin`，说明入口 JS 已通过校验并执行。
- 请求 `http://localhost:5320/robots.txt` 能看到 `Sitemap: https://example.com/sitemap.xml`。

不要用 preview 的响应头来判断 `_headers` 是否生效；它不模拟 Netlify 或 Cloudflare Pages 的配置读取行为。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 生产级实现还需补齐

- **使用 HTML 解析器**：本例用正则处理 Vite 生成的可控 HTML，`readAttribute` 也只读取双引号属性。面对任意用户模板、复杂属性格式或需要保持源码映射的场景，应使用 parse5、HTMLRewriter 等解析器，而不是继续扩展正则。
- **正确处理 base 和相对 URL**：当前 `integrityFor` 只去掉查询串、hash 和开头的 `/`，默认 HTML 引用可直接映射为 `assets/...`。它没有剥离 `/vite-learning/` 这样的 base，也没有归一化 `./assets/...`。本仓库在 `GITHUB_PAGES=true` 时会使用 `base: '/vite-learning/'`，此时必须先修正 URL 到 bundle 键的映射并增加对应断言，不能假设根路径示例可直接覆盖子路径部署。
- **接入 CDN 与 CORS**：外链绝对 URL 会被跳过，真实 CDN 流程可以从上传清单取得摘要，或在上传后另行校验。跨域 SRI 还依赖正确的 `Access-Control-Allow-Origin` 和一致的请求凭据模式；只写 `integrity` 并不能绕过 CORS。
- **谨慎扩大资源范围**：字体、图片通常不必强制使用 SRI。若要支持 `<link rel="preload" as="script">` 等更多标签，应同时确认浏览器行为、实际请求的 `crossorigin` 模式和 bundle 映射，不能只放宽标签正则。
- **单独核对 CSP**：SRI 与 CSP（内容安全策略）是两套独立校验，SRI 不会放宽 `script-src` 或 `style-src`。如果 CSP 使用 hash-source 控制脚本，或资源来源不在允许列表中，需要按部署策略同步维护 CSP。本仓库注入的是 `Content-Security-Policy-Report-Only`，只报告违规，不会实际阻断资源。
- **按目标平台生成部署配置**：`_headers` 语法和路径匹配规则因平台而异，Vercel 等平台需要不同配置。还要确认 `/`、rewrite 后的入口 URL 是否命中 HTML 缓存规则，并按平台建议补充 HSTS、Permissions-Policy 等策略。
- **替换示例站点信息**：把 `example.com` 改为真实站点，并生成真实 sitemap。`_headers` 的安全策略也应结合业务是否允许 iframe、第三方来源等因素评估，不能机械照抄。
- **保留 CI 断言与安全边界**：持续复算产物摘要并检查压缩文件，防止调整插件顺序后静默失效。SRI 能发现单独被替换的资源，但不能代替 HTTPS；如果攻击者连 HTML 也能修改，就可以同时替换引用和摘要。

:::

::: details 常见坑

- **在普通 `generateBundle` 阶段找 HTML**：此时 HTML 还没进入 `bundle`，本插件必须使用 `order: 'post'`。若改用 `writeBundle`，产物已经写盘，就要直接处理磁盘文件，并重新检查哈希与压缩顺序，不能继续假设修改 `bundle` 会自动落盘。
- **内容定稿前算哈希**：如果后续还会替换 JS/CSS 内容，旧的 `integrity` 会导致浏览器拒绝资源。本仓库让占位符替换先执行，SRI 后计算。
- **压缩后才改写 HTML**：这不会改变 JS/CSS 自身的 SRI，却会让 `.html.gz` / `.html.br` 与磁盘上的 HTML 不一致。本仓库把静态部署插件放在压缩插件之前，并用 gzip 解压断言检查顺序。
- **给所有 script 无差别套同一断言**：public 文件、外链和 data URL 不在本插件处理范围内。当前三个 `/plugin-lab/*-stub.js` 没有 `integrity` 是预期行为，不是漏处理。
- **把跨域失败归因于属性拼写**：裸写 `crossorigin` 等价于 `crossorigin="anonymous"`，并不是错误。真正需要检查的是 CDN 的 CORS 响应、请求凭据模式以及资源字节是否与摘要一致。
- **把 public 源文件当成生成结果**：`public/robots.txt` 只有基础抓取规则；构建期发射的同名 asset 会成为 `dist/robots.txt` 的最终内容，但不会回写 `public/robots.txt` 源文件。
- **给 HTML 也设置一年 immutable**：HTML 文件名固定，长缓存会让用户继续拿到旧引用。新增或删除 HTML 入口时，还要确认 `_headers` 的实际规则覆盖所有访问路径；本例通过 `htmlFiles` 按实际 HTML 产物生成文件名规则。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)；上一篇的 [版本文件与 CDN 清单](./02-deployment-artifacts.md) 可以帮助理解为什么 HTML 被排除在内容哈希清单之外。
