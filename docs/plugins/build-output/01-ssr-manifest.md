# 18. 生成 SSR / 资源映射 manifest

> 本类插件消费构建后的 chunk、asset 和 HTML，**dev 没有等价产物**，因此不提供页面示例，改用 `pnpm build` + Node 断言验收。

## 真实场景

服务端渲染、预渲染或按入口注入资源时，服务端需要知道「入口 chunk 是哪个文件、它带哪些 CSS、静态 import 了哪些 chunk」。Vite 的产物文件名带内容哈希，不能手写。插件在构建期把 chunk 图整理成一份稳定 JSON，服务端或部署脚本按入口名查询即可。

本示例输出 `dist/lab-manifest.json`，只记录单入口 `index` 的 `entry`、`file`、`css`、`imports`，与 Vite 内建 manifest 保持同一类信息，但字段更少、更适合教学观察。

## 核心钩子与数据流

1. `generateBundle` 在产物写盘前执行，能拿到本次构建的完整 `bundle`。
2. 过滤 `output.type === 'chunk' && output.isEntry`，找到入口 chunk。
3. 读取 `chunk.fileName`、`chunk.viteMetadata.importedCss`、`chunk.imports`。
4. 用 `this.emitFile` 写出 `lab-manifest.json`，让 Vite 统一落盘。

`viteMetadata` 是 Vite 在 Rollup/Rolldown 产物上补的元数据，不是标准 Rollup 字段。`imports` 只包含静态依赖的直接文件名；动态 import 在 `chunk.dynamicImports` 中，本例不展开。

## 最小实现

```ts
// plugins/build-output/ssr-manifest.ts
generateBundle(_options, bundle) {
  const entries = Object.entries(bundle).filter(
    ([, output]) => output.type === 'chunk' && output.isEntry,
  )
  const [fileName, chunk] = entries.find(([, output]) => output.name === 'index') ?? entries[0]

  const manifest = {
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
}
```

完整源码见 `plugins/build-output/ssr-manifest.ts`。真实 SSR 项目通常需要按入口名建立 `Record<string, Entry>`，并递归收集 `imports` / `dynamicImports`，否则子路由的 CSS 仍会漏掉。

## 配置接入

插件已在 `plugins/build-output/index.ts` 中注册，`vite.config.ts` 通过 `...buildOutputPlugins()` 统一接入。没有新增开发中间件、路由或页面。

## 可执行构建验证

```bash
pnpm build
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

const scriptSrc = html.match(/<script[^>]+src="([^"]+)"/)?.[1]
if (!scriptSrc || scriptSrc.replace(/^\//, '') !== manifest.file) {
  throw new Error(`HTML 入口 ${scriptSrc} 与 manifest.file ${manifest.file} 不一致`)
}

for (const css of manifest.css) {
  if (!html.includes(`href="/${css}"`)) throw new Error(`HTML 未引用 manifest.css: ${css}`)
}

console.log(`manifest OK: ${manifest.entry} -> ${manifest.file}`)
NODE
pnpm docs:build
git diff --check
```

预期输出一行 `manifest OK: index -> assets/index-*.js`。

## 何时直接用 Vite 内建 `build.manifest`

如果只需要「源模块 ID → 产物文件」的完整映射给 SSR 框架使用，优先开启：

```ts
build: {
  manifest: true, // 生成 .vite/manifest.json
}
```

内建 manifest 还包含 `src`、`isDynamicEntry`、`dynamicImports`、`assets` 等字段，并处理多入口与 CSS 关联。只有需要裁剪字段、增加业务标识（版本号、CDN 前缀、模块职责）或对接自有 SSR 运行时协议时，才值得写自定义插件。

## 生产级补齐能力

- 多入口：输出 `Record<string, Entry>`，不要依赖单个 `index`。
- 完整性：递归解析 `imports` 与 `dynamicImports`，去重并排序，保证同一构建可复现。
- 校验：构建结束时检查每个引用文件真实存在，防止插件顺序错误导致清单指向不存在的 chunk。
- 命名：清单本身也会进入 `dist`，部署脚本应把它视为元数据而不是缓存资源。

## 常见坑

- `generateBundle` 普通阶段拿不到 `index.html`。HTML 是 Vite 的 HTML 插件在更晚阶段写入 bundle 的；本插件只依赖 chunk，因此不受影响，但需要同时改 HTML 的插件必须用 `order: 'post'`。
- 直接读 `process.cwd()` 下的 `dist` 不可靠：插件执行时文件还没写盘。应使用 `bundle` 与 `this.emitFile`。
- 把 `imports` 当成完整依赖图会漏掉动态 import 与公共 CSS；需要完整映射就用 `build.manifest`。
- 在 `source` 中省略结尾换行会让部分部署工具生成无换行的 diff，教学项目统一补 `\n`。

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
