# 12.1 图片与字体：首屏体积的另一半

ch12 把大部分注意力放在 JS 上，但真实项目里，首屏最大的资源经常是图片或字体。一张未压缩的首屏大图可以轻松超过整个应用 JS 的体积；一个包含全部字形的中文字体动辄几 MB。只优化 JS，往往错过收益最大的一块。

::: tip 结论先行
- **适用**：首屏包含大图、品牌字体、图标字体或大量静态图片的项目。
- **推荐**：图片按展示尺寸生成多档并配 `srcset`；优先 webp / avif；字体只保留实际用到的字形并设置 `font-display: swap`。
- **代价**：多档图片和字体子集需要构建前处理，增加构建流程复杂度。
- **不要**：只做格式转换不做尺寸适配；也不要预加载所有字体。
:::

## 问题与判断

先用 DevTools → Network 按 `Size` 排序，确认首屏最大的三个资源是什么。常见情况：

| 资源 | 常见问题 | 优先手段 |
| --- | --- | --- |
| 首屏大图 | 原图直接上线，尺寸远超展示区域 | 按展示尺寸生成多档、webp/avif、`srcset` |
| 图标 | 每个图标一个请求，或整包图标字体 | SVG symbol / 按需引入 |
| 品牌字体 | 全量字形、未设置 `font-display` | 子集化、woff2、`swap` |
| 装饰图 | 首屏之外却同步加载 | `loading="lazy"`、`decoding="async"` |

如果首屏本身没有图片和自定义字体，这一篇的收益有限，可以跳过，先处理 JS 和请求数。

## 做法

### 1. 先理解 Vite 对静态资源的默认处理

Vite 会把小于 `build.assetsInlineLimit`（默认 4 KB）的资源内联成 base64，其余复制到 `dist/assets` 并加哈希。这个阈值对图标合适，对大图不合适：

```ts
build: {
  assetsInlineLimit: 4096,
}
```

内联的大图会直接进入 JS/CSS，既增大首屏体积，又失去独立缓存。首屏大图应保持独立文件。

显式引用资源有三种常见写法：

```ts
// 1. 作为 URL 字符串
import bigUrl from '@/assets/big.png?url'

// 2. 强制内联（只适合很小的资源）
import smallDataUrl from '@/assets/small.png?inline'

// 3. 运行时拼接 URL，路径必须是静态字面量
const bigUrl2 = new URL('../assets/big.png', import.meta.url).href
```

`new URL(..., import.meta.url)` 不能使用 `@` 别名，也不要把路径拼成变量，否则构建器无法静态分析。

### 2. 用 srcset 让浏览器选合适尺寸

只提供一张 1920px 大图，手机也会下载整张。更好的做法是同内容生成多档尺寸：

```vue
<script setup lang="ts">
import small from '@/assets/big-480.png?url'
import large from '@/assets/big-960.png?url'
</script>

<template>
  <img
    :src="large"
    :srcset="`${small} 480w, ${large} 960w`"
    sizes="(max-width: 600px) 480px, 960px"
    width="960"
    height="640"
    alt="示例大图"
    decoding="async"
  />
</template>
```

要点：

- `srcset` 给候选，`sizes` 告诉浏览器展示宽度，两者配合才会正确选择。
- 写明 `width` / `height` 或固定宽高比，避免布局抖动影响 CLS。
- 首屏之外的图片加 `loading="lazy"`，但首屏主图不要 lazy，否则会拖慢 LCP。

### 3. 生成 webp / avif

现代浏览器支持更好的图片格式，但需要你先生成文件。可以在构建前用脚本处理，例如 `sharp`：

```bash
# 示例：用 sharp-cli 把 png 转成 webp（需先安装对应工具）
npx sharp-cli -i src/assets/big.png -o src/assets/big.webp
```

也可以用社区插件 `vite-imagetools` 或 `vite-plugin-imagemin` 在构建期转换。**接入前需验证与 Vite 8 / Rolldown 1.2.19 的兼容性**，并确认插件是否仍在维护。转换后要保留原格式兜底，或者确认目标浏览器范围都支持新格式。

### 4. 字体子集化与加载策略

中文字体是首屏体积的重灾区。只保留页面实际用到的字符，通常能把几 MB 降到几十 KB：

```bash
# 示例：用 fonttools 的 pyftsubset 生成 woff2 子集
pyftsubset MyFont.ttf \
  --text-file=chars.txt \
  --flavor=woff2 \
  --output-file=src/assets/fonts/MyFont.subset.woff2
```

`chars.txt` 里放页面实际出现的字符；如果内容来自接口，子集范围要覆盖可能的字符集，或者退回按语言分片。

CSS 中设置 `font-display: swap`，避免字体下载阻塞文字渲染：

```css
@font-face {
  font-family: 'MyFont';
  src: url('@/assets/fonts/MyFont.subset.woff2') format('woff2');
  font-display: swap;
  font-weight: 400;
}
```

只对首屏关键字体加 preload，且必须带 `crossorigin`（即使同源）：

```html
<link
  rel="preload"
  href="/assets/fonts/MyFont.subset.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

不要 preload 全部字重和全部字体，那会与首屏其他资源抢带宽。

## 在本仓库验证

```bash
pnpm build
du -sh dist/assets
ls -lh dist/assets | grep -E '\.(png|jpe?g|webp|avif|woff2?)$'
```

当前仓库有 `src/assets/big.png` 和 `src/assets/small.png`。对照 `docs/guide/ch08-assets.md` 的实验，确认：

- `small.png` 小于内联阈值时不出现在 `dist` 中，而是被内联。
- `big.png` 作为独立文件输出到 `dist/assets`。

再启动预览：

```bash
pnpm preview
```

DevTools → Network：

- 手机尺寸下是否只下载 480w 候选，而不是整张大图。
- 字体是否在文字渲染前阻塞，`font-display: swap` 是否生效。
- 首屏之外的图片是否延迟加载。

## 常见坑

- **只转格式不调尺寸**：webp 大图仍然很大，尺寸适配才是主要收益。
- **把大图内联**：base64 会膨胀约 1/3，还进入首屏 JS/CSS。
- **`sizes` 写错**：浏览器按错误宽度选图，可能仍然下载最大档。
- **preload 未使用的字体**：白白占用首屏带宽，还会触发未使用资源警告。
- **字体子集缺字**：动态内容出现子集外字符时显示方框，需要保留回退字体或扩大子集。
- **忘记 `crossorigin`**：字体 preload 不带 `crossorigin` 可能被重复请求。
- **社区插件未验证兼容性**：直接接入可能与当前 Vite / Rolldown 版本冲突。
- **首屏主图 lazy**：会推迟 LCP，首屏主图应正常加载。

## 延伸阅读

- [ch12 Vite 性能优化](../ch12-performance.md)
- [ch08 静态资源处理](../../guide/ch08-assets.md)
- [12.5 体积预算、sourcemap 与线上可观测性](./09-budget-and-observability.md)
- [Vite 官方文档：Static Asset Handling](https://vite.dev/guide/assets)
