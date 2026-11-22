# 12.5 体积预算、sourcemap 与线上可观测性

ch12 的性能检查清单如果只靠人工执行，通常只能坚持一两次。真实项目需要两道保障：**构建时**用体积预算阻止明显回退；**上线后**用 sourcemap 和监控定位真实用户的问题。否则优化成果会在几次迭代后悄悄消失。

::: tip 结论先行
- **适用**：有持续迭代、多人协作，或需要定位线上错误的前端项目。
- **推荐**：用零依赖 Node 脚本把首屏 gzip 体积纳入 CI；生产使用 `sourcemap: 'hidden'`，上传监控平台后从产物删除。
- **代价**：预算过严会频繁阻断构建，过松则失去意义；sourcemap 上传需要额外的部署步骤。
- **不要**：只看 Lighthouse 总分；也不要把带源码的 `.map` 直接发布到公网。
:::

## 问题与判断

先区分三个问题：

| 问题 | 手段 |
| --- | --- |
| 这次改动有没有让首屏变大？ | 体积预算脚本 + 构建日志 |
| 哪个模块把包撑大了？ | `stats.html` |
| 线上报错对应哪段源码？ | hidden sourcemap + 错误监控 |

如果项目还没有 CI，先做预算脚本；如果已经有监控平台，再补 sourcemap 上传。两件事可以分开推进。

## 做法

### 1. 用零依赖脚本卡住首屏体积

思路：读取 `dist/index.html` 中实际引用的 JS（入口脚本 + `modulepreload`），按 gzip 后体积求和，超过阈值就退出码非 0。

下面是一段**示例脚本，按需创建**为 `scripts/check-bundle-budget.mjs`：

```js
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const LIMIT_GZIP = 60 * 1024 // 按项目实际情况调整
const html = readFileSync('dist/index.html', 'utf8')

const matches = [
  ...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.js)"/g),
]
const files = [
  ...new Set(
    matches.map((match) => match[1].replace(/^\//, '').split('?')[0]),
  ),
]

let total = 0
for (const file of files) {
  const size = gzipSync(readFileSync(join('dist', file))).length
  total += size
  console.log(`${(size / 1024).toFixed(1)} kB  ${file}`)
}

console.log(`首屏 JS gzip 合计：${(total / 1024).toFixed(1)} kB`)
if (total > LIMIT_GZIP) {
  console.error(`超出预算 ${((total - LIMIT_GZIP) / 1024).toFixed(1)} kB`)
  process.exit(1)
}
```

要点：

- 只统计 `index.html` 直接引用的 JS，不统计所有异步 chunk；否则懒加载页面也会被算进首屏。
- 用 gzip 体积而不是原始体积，更接近真实传输成本。
- 预算值先用当前基线留 10%~20% 余量，再逐步收紧。
- 阈值写死在脚本里，改动需要代码评审，避免随手放宽。

如果团队更愿意用现成工具，`size-limit` 是可选方案；**接入前需验证与当前 Vite / Rolldown 产物的兼容性**，并确认它统计的范围与你的首屏定义一致。

### 2. 生产使用 hidden sourcemap

ch12 当前配置是 `sourcemap: false`。需要线上定位时，改成：

```ts
build: {
  sourcemap: 'hidden',
}
```

`'hidden'` 会生成独立 `.map` 文件，但**不在** JS 产物里写 `//# sourceMappingURL`，普通用户在浏览器里看不到映射关系。部署流程应该是：

1. 构建生成 `.map`。
2. 把 `.map` 上传到 Sentry 等错误监控平台。
3. 从最终发布目录中删除 `.map`。
4. 只发布 JS / CSS / HTML。

如果直接把 `.map` 发布到公网，即使没有注释，只要文件名可猜，源码仍然可能泄露。监控平台通常提供上传命令或构建插件，接入前确认其与 Vite 8 产物的兼容性。

### 3. 审计 target，避免无谓的降级代码

```ts
build: {
  // Vite 8 默认值
  target: 'baseline-widely-available',
}
```

target 设得过低，构建器会引入更多 polyfill 和降级代码，产物体积反而变大。只有在有明确浏览器矩阵时才调低，并配合 [12.2 老浏览器兼容](./06-legacy-browsers.md) 评估 legacy 方案。

### 4. 三件套一起看

| 工具 | 看什么 | 频率 |
| --- | --- | --- |
| `reportCompressedSize` | 构建日志里的 gzip 体积 | 每次构建 |
| `dist/stats.html` | 最大模块、重复依赖、首屏构成 | 每次发版前 |
| 预算脚本 | 首屏 gzip 是否超阈值 | CI 每次提交 |

Lighthouse 仍然有价值，但它受设备、网络和运行环境影响大，适合看具体指标（LCP、Transfer Size、Requests），不适合只盯总分。

## 在本仓库验证

### 1. 运行预算脚本

```bash
pnpm build
node scripts/check-bundle-budget.mjs
```

（脚本按上面的示例自行创建。）当前 ch12 记录的首屏 JS 约 38 kB gzip，60 kB 的示例预算应当通过。把 `LIMIT_GZIP` 临时改成 `10 * 1024`，确认脚本以非 0 退出码失败，再改回。

### 2. 确认没有意外发布 sourcemap

```bash
find dist -name '*.map' | wc -l
```

当前 `sourcemap: false`，预期为 `0`。如果临时改成 `'hidden'` 做实验，构建后应看到 `.map`，并确认 JS 文件里没有 `sourceMappingURL` 注释：

```bash
grep -r 'sourceMappingURL' dist/assets/*.js | head
```

### 3. 生成分析报告

```bash
pnpm build:analyze
ls -lh dist/stats.html
```

打开报告，确认首屏 chunk 没有混入本该懒加载的模块。

## 常见坑

- **预算统计了所有 chunk**：把异步页面也算进首屏，导致正常改动频繁失败。
- **预算过松**：阈值远高于当前体积，回退几十 KB 也不会报警。
- **只看 Lighthouse 总分**：分数波动大，不能替代体积门禁。
- **`sourcemap: true` 直接发布**：源码泄露；应使用 `'hidden'` 并在上传后删除。
- **上传后忘记删除 `.map`**：部署目录里仍然留有源码映射。
- **target 设置过低**：引入大量 polyfill，体积不降反升。
- **预算脚本依赖构建顺序**：在 `pnpm build` 之前运行会读到旧 `dist`，CI 中要保证顺序。
- **哈希文件名变化导致对比困难**：预算只看总量，不要按文件名做历史对比。

## 延伸阅读

- [ch12 Vite 性能优化](../ch12-performance.md)
- [12.4 缓存、CDN 与部署产物](./08-cache-and-deploy.md)
- [12.2 老浏览器兼容：@vitejs/plugin-legacy 的代价](./06-legacy-browsers.md)
- [Vite 官方文档：Build Options](https://vite.dev/config/build-options)
