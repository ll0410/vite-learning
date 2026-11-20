# ch06 依赖预构建（预计 60 分钟）

## 本章目标

1. 说清依赖预构建解决的三个问题。
2. 能找到并读懂 `node_modules/.vite/deps`。
3. 会用 `optimizeDeps.include/exclude` 与 `--force`。
4. 知道 Vite 8 的预构建由 Rolldown 完成，旧写法 `optimizeDeps.esbuildOptions` 已过时。

## 前置

完成 ch05。

## 一、为什么需要预构建

浏览器只认 ESM，但 `node_modules` 里的东西并不总是理想的 ESM：

| 问题 | 预构建怎么解决 |
| --- | --- |
| 依赖可能是 CJS（如 `dayjs` 的入口） | 转成 ESM，浏览器才能 `import` |
| 一个包内部可能有几百个小文件（如 `lodash-es`） | 合并成一个文件，避免几百个请求 |
| 依赖内部的 `import` 可能指向非 ESM 路径 | 重写为可解析的 ESM 路径 |

结果就是：**每个依赖 → 一个（或少量）预构建产物，并缓存到磁盘。**

## 二、产物长什么样

```text
node_modules/.vite/deps/
├── _metadata.json          # 预构建的哈希与配置，决定缓存是否失效
├── dayjs.js
├── lodash-es.js
├── vue.js
└── vue-router.js
```

浏览器在 dev 阶段实际请求的是：

```text
/src/main.ts                       → 源码（实时转译）
/node_modules/.vite/deps/vue.js    → 预构建产物（直接返回）
```

缓存失效的触发条件（任一变化都会重新预构建）：

- `package.json` 的依赖变化（lockfile 变化）
- `vite.config` 中 `optimizeDeps` 配置变化
- `mode` / `NODE_ENV` 变化
- 手动 `--force`

## 三、本章的配置

```ts
optimizeDeps: {
  include: ['lodash-es', 'dayjs'],
},
```

- `include`：强制预构建。适合「首屏还没用到、但很快会用」的依赖，避免运行中途才发现要预构建导致页面 reload。
- `exclude`：强制不预构建。适合本身就是合法 ESM、且你希望保留其模块粒度的包（如某些调试工具）。
- `needsInterop`：只读，`_metadata.json` 里能看到哪些包做了 CJS 互操作。

## 四、动手步骤

1. 启动 dev server：

   ```bash
   pnpm dev
   ```

   首次启动终端会出现：

   ```text
   Optimizing dependencies:
     dayjs, lodash-es, vue, vue-router
   ```

2. 查看产物：

   ```bash
   ls node_modules/.vite/deps
   cat node_modules/.vite/deps/_metadata.json | head -40
   ```

   在 `_metadata.json` 里找到 `optimized` 字段，看看每个包被处理成了什么。

3. 打开 DevTools → Network，筛 `deps`，观察首页对 `vue.js`、`lodash-es.js` 的请求。

4. 对比实验：把 `optimizeDeps.include` 注释掉，删除缓存目录后重启：

   ```bash
   rm -rf node_modules/.vite   # 仅本地缓存，可安全删除
   pnpm dev
   ```

   你会发现 Vite 依然会自动发现并预构建这些依赖——`include` 只是「提前声明」，不是「唯一入口」。

5. 强制重新预构建：

   ```bash
   pnpm dev:force   # = vite --force
   ```

6. 观察缓存命中：第二次启动时不再打印 `Optimizing dependencies`，启动明显更快。

## 观察点

- `.vite/deps` 里的文件不参与 git（在 `node_modules` 内）。
- `lodash-es` 被合并成**一个**文件；这就是「减少请求数」的直接证据。
- 修改 `optimizeDeps` 配置后，即使不删缓存也会自动失效重建。

## 检查点

```bash
ls node_modules/.vite/deps | grep -E "lodash-es|dayjs"
```

- [ ] 两个依赖都有预构建产物
- [ ] `_metadata.json` 里有 `optimized` / `chunks` 字段
- [ ] 能说出预构建解决的三个问题
- [ ] 知道 `--force` 的作用

## 常见坑

- **照抄旧文章的 `optimizeDeps.esbuildOptions`** → Vite 8 用 `optimizeDeps.rolldownOptions`，旧字段只做兼容转换。
- **把业务源码目录也塞进 `include`** → `include` 只接受依赖名，不认识源码路径。
- **monorepo 里本地包没被预构建** → linked 包默认不预构建，需要显式 `include`。
- **以为删掉 `.vite/deps` 会影响生产** → 它只是开发缓存，生产构建完全不走这里。
- **手动执行 `vite optimize`** → Vite 8 已提示该命令废弃，交给 dev server 自动处理即可。

## 进阶（可跳过）

- `optimizeDeps.entries`：自定义扫描入口（多页/非标准目录时有用）。
- `optimizeDeps.holdUntilCrawlEnd`：控制「先等扫描完再返回页面」还是「边服务边发现」，用于权衡首屏闪烁。
- 阅读：<https://vite.dev/guide/dep-pre-bundling>

## 对照答案

```bash
git diff ch05 ch06
```
