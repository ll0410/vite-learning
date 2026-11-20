# 19. 生成 hash 版本文件和 CDN 上传清单

> 本类插件消费构建后的 chunk / asset / HTML，**dev 没有等价产物**，因此不提供页面示例，改用 `pnpm build` + Node 断言验收。

## 真实场景

静态资源上传 CDN 后，部署系统需要两样东西：

- 一个能代表本次构建的版本标识，用于灰度、回滚和线上比对。
- 一份「本地文件 → CDN URL → SHA-256」的清单，供上传脚本校验、断点续传和缓存刷新。

本示例在构建期计算每个可缓存产物的 SHA-256，生成 `dist/version.json` 与 `dist/cdn-manifest.json`。`cdn.example.com` 是 RFC 2606 保留的示例域名，插件只生成 URL，**不会发起任何上传或网络请求**。

## 核心钩子与数据流

1. `generateBundle` 中的 `bundle` 已经包含最终 chunk 内容（压缩、代码分割都已完成）。
2. 跳过 HTML 与清单自身，读取 `output.code` 或 `output.source`。
3. 用 Node 内置 `crypto.createHash('sha256')` 计算十六进制摘要。
4. 按路径排序后，把 `路径:哈希` 再哈希一次，得到本次构建的 `version`。
5. `this.emitFile` 写出两个 JSON 文件。

为什么跳过 HTML：下一步的 SRI 插件会改写 `<script>` / `<link>`，此时计算的 HTML 哈希在最终 `dist` 中必然过期。`version.json` 只承诺「内容哈希文件名对应的不可变资源」，HTML 由部署层单独用 ETag 或 `_headers` 控制缓存。

## 最小实现

```ts
// plugins/build-output/deployment-artifacts.ts
for (const [fileName, output] of Object.entries(bundle)) {
  if (fileName.endsWith('.html') || MANIFEST_FILES.has(fileName)) continue
  const source = output.type === 'asset' ? output.source : output.code
  hashes.set(fileName, sha256(source))
}

const sorted = [...hashes.entries()].sort(([a], [b]) => a.localeCompare(b))
const version = sha256(sorted.map(([file, hash]) => `${file}:${hash}`).join('\n'))
const baseUrl = 'https://cdn.example.com/'

this.emitFile({
  type: 'asset',
  fileName: 'cdn-manifest.json',
  source: JSON.stringify({
    baseUrl,
    files: sorted.map(([path, hash]) => ({ path, url: new URL(path, baseUrl).href, sha256: hash })),
  }, null, 2),
})
```

完整源码见 `plugins/build-output/deployment-artifacts.ts`。清单按文件名排序，保证同一份产物重复构建时顺序稳定，便于 diff。

## 配置接入

插件已在 `plugins/build-output/index.ts` 中注册，顺序位于替换占位域名之后、SRI/静态文件之前，保证哈希基于已被替换的最终字符串。没有新增路由、页面、dev 中间件或网络调用。

## 可执行构建验证

```bash
pnpm build
node --input-type=module - <<'NODE'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, normalize } from 'node:path'

const dist = 'dist'
const version = JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8'))
const cdn = JSON.parse(readFileSync(join(dist, 'cdn-manifest.json'), 'utf8'))
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

if (!cdn.baseUrl.endsWith('/')) throw new Error('baseUrl 必须以 / 结尾')

const cdnPaths = new Set()
for (const file of cdn.files) {
  if (file.url !== cdn.baseUrl + file.path) throw new Error(`URL 拼接错误: ${file.url}`)
  if (file.path.startsWith('/') || file.path.includes('..') || file.path.startsWith('dist/')) {
    throw new Error(`清单包含非法路径: ${file.path}`)
  }
  if (!existsSync(join(dist, file.path))) throw new Error(`清单文件不存在: ${file.path}`)
  if (version.files[file.path] !== file.sha256) throw new Error(`两份清单哈希不一致: ${file.path}`)
  cdnPaths.add(file.path)
}

if (cdnPaths.size !== Object.keys(version.files).length) throw new Error('两份清单文件数量不一致')
if (cdn.files.some((file) => file.path.endsWith('.html'))) throw new Error('HTML 不应进入哈希清单')

// 抽样独立重算，验证插件哈希与命令行结果一致。
for (const file of cdn.files.filter((item) => item.path.endsWith('.js')).slice(0, 3)) {
  const actual = sha256(readFileSync(join(dist, file.path)))
  if (actual !== file.sha256) throw new Error(`抽样哈希不一致: ${file.path}`)
}

const recomputed = sha256(
  Object.entries(version.files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, hash]) => `${file}:${hash}`)
    .join('\n'),
)
if (recomputed !== version.version) throw new Error('version 标识无法由 files 复算')

console.log(`deployment OK: ${cdn.files.length} files, version=${version.version.slice(0, 12)}`)
NODE
pnpm docs:build
git diff --check
```

预期输出 `deployment OK: <N> files, version=<12 位>`。也可以手动抽查：

```bash
shasum -a 256 dist/assets/index-*.js
```

结果应与 `version.json` 中对应路径的哈希一致。

## 生产级补齐能力

- 上传流程：清单生成后再由部署脚本逐项上传、比对远端哈希、跳过已存在对象；插件本身不碰网络。
- 路径前缀：真实项目常把站点部署在子路径，`baseUrl` 应从环境变量读取，并与 Vite `base` 保持一致。
- 压缩产物：本仓库的 `vite-plugin-compression2` 在更晚的 `post` 阶段生成 `.gz` / `.br`，因此不在清单里。若 CDN 需要预压缩对象，应在压缩插件之后再单独生成一份清单。
- 签名与校验：对 `cdn-manifest.json` 再做一次签名或写入 CI artifact 元数据，避免上传阶段被篡改。
- 可复现构建：`builtAt` 会随构建变化，若需要字节级可复现，改成读取 `SOURCE_DATE_EPOCH` 或 CI 构建号。

## 常见坑

- 在 `generateBundle` 之后才修改 chunk 内容，会让清单哈希与磁盘文件不一致。哈希插件必须排在所有内容改写插件之后。
- 把 `dist` 目录整个扫一遍会混入上一轮遗留文件；以 `bundle` 为准，才能保证清单只包含本次构建。
- 不要用 `path.join(baseUrl, file)` 拼 URL：Windows 会得到反斜杠，且容易产生双斜杠。`new URL(file, baseUrl)` 或显式字符串拼接更稳。
- 清单自身（`version.json` / `cdn-manifest.json`）和 HTML 不能进入哈希列表，否则会自我引用或在后续插件改写后过期。
- 示例域名只用于演示；真实上传必须走受控的部署流水线，并处理鉴权、并发、重试和回滚。

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
