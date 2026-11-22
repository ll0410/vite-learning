# 12.2 老浏览器兼容：@vitejs/plugin-legacy 的代价

ch12 的进阶列表提到了 `@vitejs/plugin-legacy`，但没有说明它什么时候值得开。这个插件会为旧浏览器额外生成一套降级产物和 polyfill，体积、构建时间和部署复杂度都会增加。用错场景时，它带来的成本远大于收益。

::: tip 结论先行
- **适用**：确有必须支持的旧浏览器，且有真实用户数据或明确合同要求。
- **推荐**：先依赖 Vite 默认的 `target: 'baseline-widely-available'`；确需兼容时再评估 legacy 双产物。
- **代价**：额外 chunk、polyfill、构建时间和部署文件数量，现代浏览器用户也可能被迫下载部分兼容代码。
- **不要**：没有数据就默认开启；也不要以为开了 legacy 就只需要维护一套代码。
:::

## 问题与判断

Vite 8 默认的 `build.target` 是 `'baseline-widely-available'`，覆盖当前主流常青浏览器。对绝大多数面向公众的产品，这已经足够。

先回答三个问题：

1. 真实用户里，旧浏览器的占比是多少？有没有埋点或服务端 UA 数据？
2. 这些用户是否必须使用完整功能，还是可以引导升级？
3. 兼容旧浏览器的成本，是否低于放弃这部分用户或提供降级页面的成本？

如果答不出第 1 条，就不要开启 legacy。凭「可能有老用户」做决定，通常会让所有用户一起承担体积成本。

## 做法

### 1. 先确认默认 target 的范围

```ts
build: {
  // Vite 8 默认值，通常不需要显式写
  target: 'baseline-widely-available',
}
```

如果团队有明确的浏览器矩阵，可以写成具体版本，但不要凭感觉设得过低。`target` 越低，构建器越可能引入降级代码和 polyfill，产物体积反而变大。

### 2. legacy 插件做了什么

`@vitejs/plugin-legacy` 的核心行为：

- 为旧浏览器生成一套 legacy chunk（通常是 SystemJS 格式）。
- 注入必要的 polyfill。
- 在 HTML 中同时输出 `type="module"` 和 `nomodule` 两套脚本。
- 现代浏览器通过 `nomodule` 机制跳过 legacy 脚本。

**接入前需验证与 Vite 8 / Rolldown 1.2.19 的兼容性**。下面只是配置形态示例，不是当前项目的推荐改动：

```ts
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11'],
      modernPolyfills: true,
    }),
  ],
})
```

插件选项会随版本变化，接入时以对应版本文档为准。

### 3. 成本对比

| 维度 | 不开启 legacy | 开启 legacy |
| --- | --- | --- |
| 现代浏览器产物 | 一套 | 一套 modern + 一套 legacy |
| 旧浏览器 | 可能无法运行 | 可运行，功能可能仍受限 |
| 构建时间 | 基准 | 明显增加 |
| 部署文件数 | 基准 | 约翻倍 |
| 缓存与 CDN | 简单 | 两套产物、两套缓存策略 |
| 调试复杂度 | 低 | 需要区分 modern / legacy 问题 |

### 4. 决策清单

满足以下条件再考虑开启：

- [ ] 有真实数据证明旧浏览器用户占比不可忽略。
- [ ] 业务方确认必须支持这些用户，而不是引导升级。
- [ ] 团队接受构建时间和产物数量增加。
- [ ] 已验证插件与当前 Vite / Rolldown 版本兼容。
- [ ] 有办法在真实旧浏览器或等价环境中回归测试。

任意一条不满足，优先保持默认 target，把精力放在首屏体积和缓存上。

## 在本仓库验证

本篇不修改项目配置。如果要在本地做一次评估，可以按下面步骤对比，验证后恢复：

```bash
# 1. 记录当前产物
pnpm build
ls dist/assets | wc -l
du -sh dist

# 2. 安装并临时接入 legacy 插件后重新构建
pnpm build
ls dist/assets | wc -l
du -sh dist

# 3. 检查 HTML 是否出现 nomodule 脚本
grep -o 'nomodule' dist/index.html | head
```

预期：开启后 `dist/assets` 文件数明显增加，`dist/index.html` 同时引用 modern 与 legacy 脚本，构建时间变长。对比完成后撤销临时插件配置。

## 常见坑

- **没有数据就开启**：让所有现代浏览器用户为极少数旧用户付出体积成本。
- **以为 legacy 只影响旧浏览器**：现代浏览器也可能下载部分兼容代码或 polyfill。
- **忽略构建时间**：大型项目开启后构建时间可能显著增加，影响 CI。
- **CDN 缓存策略没区分**：modern / legacy 产物混在一起，发版时容易残留旧文件。
- **polyfill 重复引入**：业务代码自己又引入一套 polyfill，体积叠加。
- **插件与 Vite 8 不兼容**：旧版插件可能依赖已移除的 Rollup 行为，接入前必须验证。
- **只测现代浏览器**：没有真实旧环境，兼容性无法证明。

## 延伸阅读

- [ch12 Vite 性能优化](../ch12-performance.md)
- [12.5 体积预算、sourcemap 与线上可观测性](./09-budget-and-observability.md)
- [Vite 官方文档：Building for Production](https://vite.dev/guide/build)
