# 21. 替换产物中的占位域名

> 本类插件消费构建后的 chunk / asset / HTML，**dev 没有等价产物**，因此不提供页面示例，改用 `pnpm build` + Node 断言验收；同时用 dev 请求证明占位符只在 build 被替换。

## 真实场景

同一份前端代码要部署到测试、预发、生产等多个域名，或需要把资源切到独立 CDN 域名。运行时读配置会增加首屏请求和失败面；更简单的做法是在构建期把受控占位符替换成目标公开域名。

本示例把源码中的 `__PUBLIC_ORIGIN__` 替换为 `https://static.example.com`（RFC 2606 示例域名，不会真实访问），并保证：

- 只处理文本 chunk / asset，PNG 等二进制原样保留。
- 替换发生在哈希清单与 SRI 之前，后续插件看到的是最终字符串。
- dev 不做替换，便于确认占位符只影响构建产物。

## 核心钩子与数据流

1. 插件声明 `apply: 'build'`，dev server 完全跳过。
2. `renderChunk` 处理 JS chunk：在文件名内容哈希计算之前改写代码，替换后的内容会反映到文件名哈希中。
3. `generateBundle` 处理非 chunk 的文本 asset（`.css`、`.json`、`.svg`、`.txt` 等），按扩展名白名单跳过图片、字体等二进制。
4. `buildStart` 重置计数器，`generateBundle` 结束时输出替换次数；没有替换时给出 warning，避免 fixture 被误删后静默失效。
5. 插件排在 `buildOutputPlugins()` 数组第一位，后续 manifest、哈希、SRI 都基于替换后的内容。

受控来源是 `plugins/build-output/fixtures/public-origin.ts`：

```ts
export const publicOriginFixture = '__PUBLIC_ORIGIN__/build-output/logo.svg'
```

它在 `src/plugin-lab/setup/build-output.ts` 中被引用并挂到 `window.__LAB_PUBLIC_ORIGIN__`，因此 dev 和 build 的模块图里都真实存在这个字符串；dev 访问时仍是占位符，build 后变成公开域名。

## 最小实现

```ts
// plugins/build-output/replace-built-assets.ts
renderChunk(code) {
  if (!code.includes(PLACEHOLDER)) return null
  return { code: code.split(PLACEHOLDER).join(PUBLIC_ORIGIN), map: null }
},

generateBundle(_options, bundle) {
  for (const [fileName, output] of Object.entries(bundle)) {
    if (output.type !== 'asset' || !TEXT_FILE.test(fileName)) continue
    const text = typeof output.source === 'string'
      ? output.source
      : new TextDecoder().decode(output.source)
    if (!text.includes(PLACEHOLDER)) continue
    output.source = text.split(PLACEHOLDER).join(PUBLIC_ORIGIN)
  }
}
```

`TEXT_FILE` 使用白名单 `/\.(?:m?js|cjs|css|html|json|txt|svg|xml|map)$/i`，而不是对 `Uint8Array` 统一 `TextDecoder` 解码，后者会把 PNG 的字节改写成乱码。完整源码见 `plugins/build-output/replace-built-assets.ts`。

## 配置接入

`plugins/build-output/index.ts` 的注册顺序是：

```ts
return [
  replaceBuiltAssetsPlugin(),
  ssrManifestPlugin(),
  deploymentArtifactsPlugin(),
  staticDeploymentPlugin(),
]
```

替换必须最先执行；否则 `version.json` / `cdn-manifest.json` 记录的是旧内容哈希，SRI 也会对旧字节计算。没有新增路由、页面或 dev 中间件，fixture 只通过既有 setup 挂载。

## 可执行构建验证

```bash
pnpm build
node --input-type=module - <<'NODE'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const dist = 'dist'
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

const replaced = textFiles.filter((file) => readFileSync(file, 'utf8').includes('https://static.example.com'))
if (replaced.length === 0) throw new Error('没有文本产物包含目标公开域名')
const chunk = replaced.find((file) => file.endsWith('.js'))
if (!chunk) throw new Error('入口 JS 未包含替换后的域名')

const image = files.find((file) => /assets[\\/]big-.*\.png$/.test(file))
if (!image) throw new Error('未找到待校验的 PNG 产物')
const imageBuffer = readFileSync(image)
if (!imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
  throw new Error('PNG 文件头损坏')
}
if (!imageBuffer.includes(Buffer.from('IEND'))) throw new Error('PNG 缺少 IEND 块')

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex')
if (digest(imageBuffer) !== digest(readFileSync('src/assets/big.png'))) {
  throw new Error('PNG 与源文件哈希不一致')
}

console.log(`replace OK: ${relative(dist, chunk)} 已替换，${relative(dist, image)} 未损坏`)
NODE
pnpm docs:build
git diff --check
```

预期输出一行 `replace OK: assets/index-*.js 已替换，assets/big-*.png 未损坏`。

再验证 dev 不替换：

```bash
pnpm exec vite --port 5219 --strictPort
# 另一个终端
curl -s http://localhost:5219/plugins/build-output/fixtures/public-origin.ts | grep __PUBLIC_ORIGIN__
```

应看到 `__PUBLIC_ORIGIN__/build-output/logo.svg`；浏览器控制台的 `window.__LAB_PUBLIC_ORIGIN__` 也应是占位符。构建产物中同一字符串已变为 `https://static.example.com/build-output/logo.svg`。

## 生产级补齐能力

- **优先使用环境变量**：能通过 `import.meta.env` 或 `define` 注入的公开配置，优先用 Vite 原生能力；占位符替换适合必须出现在第三方产物或静态文本中的字符串。
- **精确的文本判定**：按扩展名 + MIME 白名单，必要时检查字节是否为合法 UTF-8；不要对所有 asset 解码。
- **HTML 处理**：HTML 在 `generateBundle` 的 post 阶段才出现。若占位符会进入 HTML，应改用 `transformIndexHtml` 或在 `order: 'post'` 中处理。
- **多目标构建**：把 `PUBLIC_ORIGIN` 变为插件参数或环境变量，避免把域名硬编码到教学代码。
- **可观测性**：统计替换次数并写入构建日志；CI 中保留「产物不含占位符」断言。
- **Sourcemap**：本项目关闭 sourcemap。开启时需要在 `renderChunk` 同步处理 `map` 或接受映射偏移，生产项目应使用 `magic-string` 等工具生成映射。

## 常见坑

- 在 `generateBundle` 里改 chunk 代码也能生效，但文件名内容哈希已经算完，文件名与最终内容不再对应；chunk 改写放在 `renderChunk` 更正确。
- 对所有 `Uint8Array` 做 `TextDecoder` 会损坏 PNG/字体；必须先按文件名或 MIME 判断文本类型。
- 插件顺序放错（在哈希清单或 SRI 之后）会让 `version.json` 和 `integrity` 全部对应旧内容，浏览器直接拒绝加载。
- 忘记 `apply: 'build'` 会让 dev 也替换，掩盖只在生产出现的域名问题；本示例故意在 dev 保留占位符。
- 只替换 `js` 会漏掉 CSS 里的 `url()` 或 JSON 配置；只替换所有文件又会损坏二进制，需要白名单。
- 占位符命名要足够独特，避免与业务文案或其他工具的模板标记冲突。

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
