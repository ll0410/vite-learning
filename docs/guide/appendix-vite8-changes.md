# 附录：Vite 8 的关键变化

本仓库基于 **Vite 8.3.8**。网上大量 Vite 4/5 的文章仍在使用 esbuild + Rollup 的写法，看到下面这些差异时不要怀疑自己。

## 1. 技术栈替换

| 能力 | Vite ≤7 | Vite 8 |
| --- | --- | --- |
| 生产打包 | Rollup | Rolldown |
| JS 转译 / 压缩 | esbuild | Oxc |
| CSS 压缩 | esbuild | Lightning CSS |
| 依赖预构建 | esbuild | Rolldown |

## 2. 配置项映射

| 旧写法 | Vite 8 对应写法 | 状态 |
| --- | --- | --- |
| `build.rollupOptions` | `build.rolldownOptions` | 旧名仍可用，**已废弃** |
| `optimizeDeps.esbuildOptions` | `optimizeDeps.rolldownOptions` | 旧名会做兼容转换 |
| `optimizeDeps.esbuildOptions.minify` | `optimizeDeps.rolldownOptions.output.minify` | 自动转换 |
| `optimizeDeps.esbuildOptions.define` | `optimizeDeps.rolldownOptions.transform.define` | 自动转换 |
| `output.manualChunks`（对象形式） | `output.codeSplitting.groups` | **对象形式已移除** |
| `output.manualChunks`（函数形式） | `output.codeSplitting.groups` | 已废弃 |
| `esbuild` 配置项 | `oxc` 配置项 | `esbuild` 已废弃，自动转换为 `oxc` |

### 代码分割的正确写法

```ts
// vite.config.ts —— Vite 8
export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { test: /node_modules\/(vue|vue-router)\//, name: 'vendor-vue' },
          ],
        },
      },
    },
  },
})
```

### CSS 压缩

- 默认 `build.cssMinify: 'lightningcss'`。
- 想回退 esbuild：`build.cssMinify: 'esbuild'`，但需要自己安装 `esbuild`。
- Lightning CSS 的语法降级能力更强，CSS 体积可能略有变化，属于预期行为。
- 配置入口：`css.lightningcss`（targets、drafts 等）。

## 3. 默认值变化

- `build.target` 默认 `'baseline-widely-available'`，对应 Chrome 111 / Edge 111 / Firefox 114 / Safari 16.4（以 2026-01-01 为基准）。
- 需要兼容更老的浏览器时，显式设置 `build.target` 或引入 `@vitejs/plugin-legacy`。

## 4. 行为变化

- CommonJS 互操作规则统一：`default` 导入的行为取决于导入方是否为 ESM。
- 不再通过「格式嗅探」解析模块。
- `build()` JS API 抛出的错误变为 `BundleError`，可用 `e.errors` 读取子错误。
- 被 external 的模块中的 `require` 调用行为变化（与 SSR/库构建相关）。

## 5. 对本学习路线的影响

| 章节 | 受影响的点 |
| --- | --- |
| ch03 | 多页应用要写 `build.rolldownOptions.input` |
| ch06 | 预构建调优写 `optimizeDeps.rolldownOptions` |
| ch07 | CSS 压缩默认 Lightning CSS，不要照抄 esbuild 时代的配置 |
| ch11 | 代码分割必须用 `codeSplitting.groups`，`manualChunks` 对象写法会失效 |
| ch12 | 产物分析插件需支持 Rolldown（本项目用 `rollup-plugin-visualizer@7`） |

## 6. 如何自行查证

- 迁移指南：<https://vite.dev/guide/migration>
- 构建配置：<https://vite.dev/config/build-options>
- Rolldown 手动代码分割：<https://rolldown.rs/in-depth/manual-code-splitting>

判断一个教程是否过时，最快的办法是搜它有没有出现 `manualChunks`、`build.rollupOptions`、`esbuild: { ... }` 这三样。
