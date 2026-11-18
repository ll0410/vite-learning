# ch08 静态资源处理（预计 50 分钟）

## 本章目标

1. 分清 `public/` 与 `src/assets/` 的边界。
2. 掌握 `默认导入`、`?url`、`?raw`、`?inline`、`new URL` 五种写法。
3. 理解 `assetsInlineLimit` 如何影响「内联还是独立文件」。
4. 知道 `assetsInclude` 与 `base` 对资源路径的影响。

## 前置

完成 ch07。

## 一、`public/` vs `src/assets/`

| 维度 | `public/` | `src/assets/` |
| --- | --- | --- |
| 是否参与打包 | 否 | 是 |
| 文件名是否加 hash | 否 | 是 |
| 引用方式 | 绝对路径 `/xxx` | `import` |
| 是否支持内联 | 否 | 是（小于阈值时） |
| 适合放 | `robots.txt`、`favicon`、需要固定路径的文件 | 组件里真正用到的图片/字体/文本 |

判断标准：**「这个文件是否需要被 JS/模板引用并能享受 hash 缓存」**。是 → `src/assets`；否 → `public`。

## 二、五种导入写法

```ts
// 1. 默认导入：返回最终 URL（大文件独立输出，小文件 base64）
import bigPng from '@/assets/big.png'

// 2. ?url：强制返回 URL（即使文件很小也不内联）
import logoUrl from '@/assets/logo.svg?url'

// 3. ?inline：强制内联，返回 data URI
import logoInline from '@/assets/logo.svg?inline'

// 4. ?raw：返回文件内容的字符串
import noteRaw from '@/assets/note.txt?raw'

// 5. new URL：运行时才确定路径的场景
const dynamicSmall = new URL('../assets/small.png', import.meta.url).href
```

补充：

- `?url` 适用于「我需要地址，但不要被内联」。
- `?raw` 除了文本，也能读取代码片段、Shader、模板。
- `new URL` 必须用**相对路径**，别名 `@` 不会被解析。

## 三、内联阈值

```ts
build: {
  assetsInlineLimit: 4096, // 默认 4KB
}
```

- 小于 4KB 的资源被 base64 内联进 JS/CSS。
- 好处：少一次请求；坏处：增大 JS 体积、无法单独缓存。
- 本项目实测：

  | 文件 | 大小 | 结果 |
  | --- | --- | --- |
  | `small.png` | 74 B | 内联（`dist` 中不存在） |
  | `big.png` | 187 KB | 独立文件 `big-<hash>.png` |

## 四、自定义资源类型

默认不认识的扩展名（如 `.glsl`）会被当作「无法解析」。可以：

```ts
assetsInclude: ['**/*.glsl'],
```

之后 `import shader from './x.glsl?raw'` 才能工作。

## 五、动手步骤

1. 启动 dev：

   ```bash
   pnpm dev
   ```

2. 打开顶部导航「静态资源」，逐块观察四个面板。

3. 打开 DevTools → Elements，检查 `small.png` 的 `src`：应该是 `data:image/png;base64,...`。

4. 检查 `big.png` 的 `src`：应该是 `/src/assets/big.png`（dev 下不 hash，构建后才 hash）。

5. 点击 `/data/notes.json` 链接：返回 public 下的原始 JSON。

6. 生产构建：

   ```bash
   pnpm build
   find dist -type f | sort
   ```

   预期：

   ```text
   dist/assets/big-<hash>.png     ← 独立文件
   dist/assets/index-<hash>.css
   dist/assets/index-<hash>.js    ← 内含 small.png 的 base64
   dist/data/notes.json           ← public 原样复制
   dist/favicon.svg
   dist/index.html
   dist/robots.txt
   ```

7. 调大阈值再构建：

   ```ts
   build: { assetsInlineLimit: 300 * 1024 }
   ```

   `big.png` 会从 `dist/assets` 消失，全部内联进 JS（体积会明显变大）。看完记得改回来。

## 观察点

- 构建输出里 `big-*.png` 的文件名带内容 hash，可以长期强缓存。
- `dist` 中没有 `small.png`，说明它确实被内联。
- `public/` 里的文件路径与源码目录一一对应。

## 检查点

```bash
pnpm build
find dist -name "small.png" | wc -l    # 应为 0
find dist -name "big-*.png" | wc -l    # 应为 1
grep -c "data:image/png;base64" dist/assets/*.js
```

- [ ] `small.png` 不在产物中
- [ ] `big.png` 以 hash 文件名输出
- [ ] `public/robots.txt`、`public/data/notes.json` 被原样复制
- [ ] 能说清 `?url` 与 `?inline` 的区别

## 常见坑

- **把需要 hash 的图片放 `public/`** → 失去缓存失效能力，改图后客户端可能一直用旧图。
- **在 `public/` 里用 `import`** → 不行，`public` 的文件不参与模块图。
- **`base` 配置后写死 `/assets/x.png`** → 部署到子路径会 404；public 资源应配合 `import.meta.env.BASE_URL` 拼接。
- **`new URL('@/assets/x.png', import.meta.url)`** → 别名不生效，必须相对路径。
- **内联阈值调得过大** → JS 体积暴涨、首屏解析变慢。
- **SVG 当组件用** → 原生 Vite 只把它当资源；要当组件需要额外插件（如 `vite-svg-loader`），不在本章范围。

## 进阶（可跳过）

- 字体：`@font-face` 的 `url()` 会被 Vite 重写并加 hash，注意 `base`。
- `?worker` / `?worker&inline`：Web Worker 的专用后缀。
- 阅读：<https://vite.dev/guide/assets>

## 对照答案

```bash
git diff ch07 ch08
```
