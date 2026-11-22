# 11.3 Rolldown codeSplitting.groups 调优

ch11 已经用 `vendor-vue` 和 `vendor-utils` 演示了最基本的手动分组。真实项目里还会遇到：某个 vendor chunk 过大、多个入口重复加载同一批依赖、想只捕获首屏依赖、或者拆分后出现循环 chunk。这些都需要 `codeSplitting.groups` 的细分字段来控制。

::: tip 结论先行
- **适用**：已经做了基础分包，但 chunk 体积、缓存命中或多入口加载仍不理想的项目。
- **推荐**：先用 `priority` 明确归属，再用 `maxSize` 限制单 chunk 体积，多入口项目再考虑 `entriesAware`。
- **代价**：每加一条分组规则都会改变 chunk 图，必须用 `pnpm build` 和 `stats.html` 对比，不能凭配置直觉判断。
- **不要**：把每个依赖都拆成一组，请求数会暴增；也不要把所有依赖塞进一个 vendor，缓存会整体失效。
:::

## 问题与判断

先确认问题属于哪一类，再决定用哪个字段：

| 现象 | 优先检查 |
| --- | --- |
| 某个 vendor chunk 特别大 | `maxSize`、`maxModuleSize`、是否整包引入 |
| 改一行业务代码，vendor 缓存全失效 | 分组是否把业务代码和依赖混在一起 |
| 多入口都加载了用不到的依赖 | `entriesAware`、`minShareCount` |
| 首屏 chunk 里混入非首屏模块 | `tags: ['$initial']`、`priority` |
| 拆分后出现循环 chunk 警告 | `includeDependenciesRecursively`、`strictExecutionOrder` |

只有两三个依赖、产物本来就很小的项目，不需要调这些字段。分组的目标是**缓存稳定**和**首屏可控**，不是 chunk 数量最多。

## 做法

### 1. 现有配置是起点

`vite.config.ts` 当前的分组是：

```ts
build: {
  rolldownOptions: {
    output: {
      codeSplitting: {
        groups: [
          { name: 'vendor-vue', test: /node_modules[\\/](vue|vue-router|@vue)[\\/]/ },
          { name: 'vendor-utils', test: /node_modules[\\/](lodash-es|dayjs)[\\/]/ },
        ],
      },
    },
  },
}
```

它解决的是「框架和工具库分开缓存」。下面是在此基础上的**演示配置，按需加入**，不要直接覆盖现有配置：

```ts
codeSplitting: {
  minSize: 20_000,
  groups: [
    {
      name: 'vendor-vue',
      test: /node_modules[\\/](vue|vue-router|@vue)[\\/]/,
      priority: 20,
    },
    {
      name: 'vendor-utils',
      test: /node_modules[\\/](lodash-es|dayjs)[\\/]/,
      priority: 10,
    },
    {
      name: 'vendor-rest',
      test: /node_modules[\\/]/,
      priority: 0,
      maxSize: 300_000,
    },
  ],
}
```

### 2. 关键字段怎么理解

| 字段 | 作用 | 实践建议 |
| --- | --- | --- |
| `name` | 分组名，同时作为 chunk 名 | 用 `vendor-*`、`feature-*` 这类稳定前缀 |
| `test` | 按模块 id 的字符串 / 正则 / 函数匹配 | 正则统一用 `[\\/]` 匹配路径分隔符 |
| `priority` | 多个分组都能匹配时，优先级高的先选 | 框架 > 工具库 > 兜底组 |
| `minSize` | 分组累计体积小于该值时放弃分组 | 避免产生大量几 KB 的碎 chunk |
| `maxSize` | 分组体积超过该值时再拆成多个 chunk | 给超大 vendor 设上限，注意可能拆出循环依赖 |
| `minModuleSize` / `maxModuleSize` | 限制单个模块能否进入该组 | 把超大模块单独处理，避免拖累整组 |
| `minShareCount` | 模块至少被多少个入口引用才捕获 | 多入口项目用来过滤只被一个入口使用的模块 |
| `entriesAware` | 按「哪些入口实际使用」再细分 | 多入口项目减少无关代码 |
| `entriesAwareMergeThreshold` | 合并过小的 entriesAware 子组 | 与 `entriesAware` 配合，避免碎 chunk |
| `includeDependenciesRecursively` | 连同被捕获模块的依赖一起纳入 | 默认 `true`，可降低循环 chunk 风险，但可能把业务代码吸进 vendor |
| `tags` | 按内置标签过滤，当前可用 `$initial` | 只想处理首屏静态依赖时使用 |
| `debugName` | 给函数形式的 `name` 加调试标签 | 只影响构建报告，不改变 chunk 名 |

### 3. 多入口：让每个入口只加载自己用到的依赖

项目里有 `index.html` 和 `admin.html` 两个入口。默认情况下，同一分组会把所有匹配模块合并成一个 chunk，admin 可能加载只有首页才用的依赖。可以这样调整：

```ts
{
  name: 'vendor-shared',
  test: /node_modules[\\/]/,
  priority: 0,
  entriesAware: true,
  entriesAwareMergeThreshold: 20_000,
}
```

`entriesAware: true` 会按「模块被哪些入口引用」再分组：所有入口都用的模块留在一个共享 chunk，只有部分入口用的模块进入单独 chunk。阈值用来把小分组并回邻近分组，避免 chunk 太碎。

### 4. 只想处理首屏依赖

如果目标是控制首屏，而不是给所有依赖分组，可以用内置标签：

```ts
{
  name: 'initial-deps',
  tags: ['$initial'],
  maxSize: 1_000_000,
}
```

`$initial` 表示「被用户入口静态导入，或位于其静态依赖链上」的模块。它适合做首屏预算和超大首屏 chunk 的拆分，不适合替代按框架 / 工具库分组的缓存策略。两套思路建议分开评估，不要在一个配置里同时堆满规则。

### 5. 从 manualChunks 迁移

旧文章里的写法在当前版本已经不能照抄：

```ts
// 对象形式：Vite 8 已不支持
manualChunks: {
  vue: ['vue', 'vue-router'],
}
```

函数形式也已废弃；并且 `manualChunks` 与 `codeSplitting` 同时存在时，`manualChunks` 会被忽略。迁移对照：

| 旧写法 | 新写法 |
| --- | --- |
| `manualChunks: { vendor: ['vue'] }` | `groups: [{ name: 'vendor', test: /node_modules[\\/]vue[\\/]/ }]` |
| `manualChunks(id) { ... }` | `groups: [{ name: (id) => ..., test: ... }]` |
| 无法按体积拆分 | `maxSize` / `maxModuleSize` |

## 在本仓库验证

### 1. 调整前后对比 chunk

```bash
pnpm build
ls -lh dist/assets/*.js
```

记录 `vendor-vue-*`、`vendor-utils-*` 和 `index-*` 的体积与数量，再加入演示配置重新构建，对比：

- 是否出现新的 `vendor-rest-*`。
- `vendor-vue-*` 是否仍然稳定存在。
- chunk 总数是否明显增加。

### 2. 用分析报告确认模块归属

```bash
pnpm build:analyze
open dist/stats.html
```

重点看：

- 最大的模块是否落在预期的分组里。
- 同一个依赖是否出现在多个 chunk 中。
- 业务代码是否被 `includeDependenciesRecursively` 吸进了 vendor。

### 3. 多入口验证

构建后检查 `dist/admin.html` 与 `dist/index.html` 引用的 chunk：

```bash
grep -o 'assets/[^"]*\.js' dist/index.html
grep -o 'assets/[^"]*\.js' dist/admin.html
```

开启 `entriesAware` 后，admin 不应再加载只有首页使用的依赖。

## 常见坑

- **分组过细**：每个包一组会产生大量请求，HTTP/1.1 下尤其明显。
- **`maxSize` 拆出循环 chunk**：体积上限是硬约束，拆分后可能出现互相引用，需配合 `includeDependenciesRecursively` 和构建警告确认。
- **`priority` 冲突**：多个组都能匹配同一模块时，低优先级组会「少一块」，看起来像配置没生效。
- **`test` 用 `/` 匹配路径**：Windows 下路径分隔符不同，统一写成 `[\\/]`。
- **`minSize` 让小组消失**：小分组被放弃后会回退到自动分包，chunk 名可能和预期不同。
- **`includeDependenciesRecursively` 把业务代码吸进 vendor**：vendor 组匹配到某个依赖后，连带把它的业务侧引用也拉进来，缓存边界被破坏。
- **照抄旧文章的 `manualChunks`**：对象形式直接失效，函数形式已废弃。
- **只看 chunk 数量**：数量少不等于性能好，要看首屏体积、缓存稳定性和请求顺序。

## 延伸阅读

- [ch11 Code Splitting 代码分割](../ch11-code-splitting.md)
- [11.4 预加载、modulepreload 与 chunkImportMap](./04-preload-and-importmap.md)
- [Rolldown 官方文档：Manual Code Splitting](https://rolldown.rs/in-depth/manual-code-splitting)
