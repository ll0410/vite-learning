# 20. 生成 SRI、robots.txt、_headers

> 本类插件消费构建后的 chunk / asset / HTML，**dev 没有等价产物**，因此不提供页面示例，改用 `pnpm build` + Node 断言验收。

## 真实场景

静态站点上线时经常需要三件事：

- **SRI（Subresource Integrity）**：在 HTML 的 `<script>` / `<link>` 上写 `integrity="sha384-..."`，浏览器下载后校验资源内容，防止 CDN 或中间节点篡改。
- **robots.txt**：告诉搜索引擎哪些路径可抓取。
- **`_headers`**：Netlify、Cloudflare Pages 等静态托管平台支持的响应头配置，用于长缓存 `assets/*`、禁止缓存 HTML。

本示例对最终 JS/CSS 计算 SHA-384，把 `integrity` 与 `crossorigin="anonymous"` 写回构建后的 HTML，并生成两个静态配置文件。示例只读取本地产物，不访问网络。

## 核心钩子与数据流

1. Vite 的 HTML 插件在 `generateBundle` 的 **post** 阶段才把 `index.html` / `admin.html` 放进 `bundle`；普通阶段只能看到 JS/CSS/图片。
2. 因此本插件使用 `generateBundle: { order: 'post', handler }`，遍历所有 `.html` asset。
3. 对 `<script src>`、`<link rel="stylesheet">`、`<link rel="modulepreload">` 解析同源 URL，在 `bundle` 中找到对应输出。
4. 用 `crypto.createHash('sha384')` 对**当前最终内容**计算 Base64 摘要，重写标签属性。
5. 最后 `emitFile` 生成 `robots.txt` 与 `_headers`。

插件注册在 `vite-plugin-compression2` 之前，而 compression 也是 `post` 阶段；同阶段按插件顺序执行，所以 HTML 先获得 `integrity`，随后才生成 `.html.gz`。Node 断言会解压对照，确认压缩产物与最终 HTML 完全一致。

## 最小实现

```ts
// plugins/build-output/static-deployment.ts
generateBundle: {
  order: 'post',
  handler(_options, bundle) {
    for (const [fileName, output] of Object.entries(bundle)) {
      if (output.type !== 'asset' || !fileName.endsWith('.html')) continue
      const html = String(output.source)
      output.source = html.replace(/<script\b[^>]*>/gi, (tag) => {
        const src = readAttribute(tag, 'src')
        const integrity = src ? integrityFor(src) : undefined
        return integrity ? withIntegrity(tag, integrity) : tag
      })
    }
    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: ROBOTS_TXT })
    this.emitFile({ type: 'asset', fileName: '_headers', source: headers })
  },
}
```

`withIntegrity` 会先移除旧的 `integrity` / `crossorigin`，再统一写入 `integrity="sha384-..." crossorigin="anonymous"`，保证重复执行也不会叠加属性。完整实现见 `plugins/build-output/static-deployment.ts`。

## 配置接入

插件已在 `plugins/build-output/index.ts` 中注册，位于替换占位域名和哈希清单之后。没有修改任何页面或路由；`admin.html` 与 `src/mpa/admin.ts` 由第 4 类「HTML 注入」的 MPA 示例提供，本插件只负责处理构建后的两个 HTML。

## 可执行构建验证

> 验证脚本要求仓库包含 `admin.html` 入口（第 4 类提供）。若只裁剪了本分类，脚本会明确提示缺少 `admin.html`。

```bash
pnpm build
node --input-type=module - <<'NODE'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'

const dist = 'dist'
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1]
const htmlFiles = ['index.html', 'admin.html']

for (const htmlFile of htmlFiles) {
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
    const file = url.replace(/^\/+/, '')
    const integrity = attr(tag, 'integrity')
    if (!integrity?.startsWith('sha384-')) throw new Error(`${htmlFile} 缺少 SRI: ${url}`)
    if (attr(tag, 'crossorigin') !== 'anonymous') throw new Error(`${htmlFile} 缺少 crossorigin: ${url}`)

    const actual = `sha384-${createHash('sha384').update(readFileSync(join(dist, file))).digest('base64')}`
    if (actual !== integrity) throw new Error(`${htmlFile} SRI 与产物不一致: ${url}`)
    checked++
  }

  if (checked === 0) throw new Error(`${htmlFile} 没有任何可校验的入口引用`)

  const gzPath = `${htmlPath}.gz`
  if (existsSync(gzPath)) {
    const compressed = gunzipSync(readFileSync(gzPath)).toString('utf8')
    if (compressed !== html) throw new Error(`${htmlFile}.gz 与最终 HTML 不一致（压缩发生在 SRI 之前）`)
  }
  console.log(`SRI OK: ${htmlFile} (${checked} 个引用)`)
}

const robots = readFileSync(join(dist, 'robots.txt'), 'utf8')
if (!robots.includes('Sitemap: https://example.com/sitemap.xml')) throw new Error('robots.txt 内容不正确')

const headers = readFileSync(join(dist, '_headers'), 'utf8')
if (!headers.includes('X-Content-Type-Options: nosniff')) throw new Error('_headers 缺少安全头')
if (!headers.includes('/assets/*') || !headers.includes('immutable')) throw new Error('_headers 缺少资源缓存规则')
for (const htmlFile of htmlFiles) {
  if (!headers.includes(`/${htmlFile}`) || !headers.includes('must-revalidate')) {
    throw new Error(`_headers 缺少 ${htmlFile} 缓存规则`)
  }
}
console.log('static deploy files OK')
NODE
pnpm docs:build
git diff --check
```

预期输出：

```text
SRI OK: index.html (4 个引用)
SRI OK: admin.html (2 个引用)
static deploy files OK
```

## 生产级补齐能力

- **HTML 解析**：示例用正则处理 Vite 生成的可控 HTML。面对用户模板、内联脚本或属性顺序不稳定的场景，应使用 parse5 / HTMLRewriter 等解析器。
- **CSP 联动**：若页面启用了 `script-src`，需要把 SRI 哈希同步写进 CSP；否则浏览器仍会拒绝执行。
- **更多资源**：字体、图片一般不强制 SRI；`<link rel="preload" as="script">` 也可以补 `integrity`，但要确保与真实请求的 `crossorigin` 模式一致。
- **部署头**：`_headers` 语法因平台而异（Netlify / Cloudflare Pages / Vercel）。真正上线时应按目标平台生成对应格式，并补充 HSTS、Permissions-Policy 等策略。
- **完整性校验**：CI 中保留本指南的 Node 断言，防止插件顺序调整后 SRI 与压缩产物错位。

## 常见坑

- 在 `generateBundle` 普通阶段改 HTML 找不到文件：HTML 此时还没进入 `bundle`。必须使用 `order: 'post'` 或 `writeBundle`。
- 先算哈希再做压缩、压缩后再改写 HTML，会导致 `.html.gz` 与最终 HTML 不一致；SRI 必须排在压缩之前（本仓库通过插件顺序保证）。
- 使用 `crossorigin` 裸属性或省略它，会让 SRI 校验在跨域 CDN 场景失败；示例统一写 `crossorigin="anonymous"`。
- 对 CDN 绝对 URL 直接 `readFileSync` 会失败；示例只处理同源路径，跨域资源应改为从上传清单取哈希。
- `public/` 目录中的 `robots.txt` 是脚手架占位文件；插件在构建期生成的同名 asset 会覆盖最终产物，仓库源文件保持不变。
- 修改 HTML 后忘记同步 `_headers` 里的 HTML 缓存规则，会出现「HTML 缓存一年」导致新版本无法上线的典型事故。

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
