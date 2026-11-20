# ch11 Code Splitting 代码分割（预计 50 分钟）

## 本章目标

1. 会用三种方式做代码分割：路由懒加载、组件级动态 `import()`、vendor 手动分组。
2. 掌握 Vite 8 的新写法 `output.codeSplitting.groups`，知道 `manualChunks` 已不可用。
3. 能读懂构建产物里的 chunk 结构，并判断拆分是否合理。
4. 知道 `modulepreload`、`cssCodeSplit` 的作用。

## 前置

完成 ch10。

## 一、三种分割方式

| 方式 | 触发点 | 典型场景 |
| --- | --- | --- |
| 路由懒加载 | 进入路由 | 首页不需要的页面 |
| 动态 `import()` | 用户交互 | 弹窗、富文本编辑器、图表库 |
| 手动 vendor 分组 | 构建期 | 把稳定依赖拆成可长期缓存的 chunk |

前两种是**代码层面**的（Rolldown 自动识别 `import()`），第三种是**配置层面**的。

## 二、路由懒加载

```ts
{
  path: '/dashboard',
  name: 'dashboard',
  component: () => import('@/views/Dashboard.vue'),
}
```

Vite 把每个 `import()` 变成一个独立的 chunk，只有导航到该路由时才下载。

Home 仍然静态导入（首屏必须），About / Assets / Dashboard / NotFound 全部懒加载。

## 三、组件级动态导入

```ts
async function loadFormatModule() {
  const mod = await import('@/utils/format')
  formatResult.value = [mod.formatDate(Date.now()), mod.slugify('Vite Code Splitting')]
}
```

适用判断：

- 这个功能**首屏一定用不到**？→ 动态导入。
- 体积**大于 50KB**？→ 优先动态导入。
- 只是几个纯函数？→ 收益有限，拆了反而多一次请求。

## 四、Vite 8 的 vendor 分组写法

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

> 不要照抄旧文章：`build.rollupOptions.output.manualChunks`（对象形式）在 Vite 8 已**移除**，函数形式也已废弃。正确入口是 `codeSplitting.groups`。

分组策略建议：

| 策略 | 优点 | 风险 |
| --- | --- | --- |
| 按框架（vue 全家桶单独一组） | 框架不常变，缓存最稳 | 单 chunk 偏大 |
| 按工具库（lodash/dayjs 一组） | 缓存命中率高 | 业务用不到也会加载 |
| 按路由自动拆 | 首屏最小 | 公共依赖可能重复请求 |
| 过度拆分（每个包一组） | 理论最优 | 请求数暴增，反而更慢 |

经验值：**首屏 JS ≤ 200KB（gzip 前）、单个 chunk ≤ 500KB**，超过就要审视。

## 五、构建产物长什么样

本仓库 `pnpm build` 的实际输出：

```text
dist/assets/
├── index-*.js              8 KB    ← 入口 + 首屏
├── vendor-vue-*.js        89 KB    ← vue + vue-router
├── vendor-utils-*.js      27 KB    ← lodash-es + dayjs
├── Dashboard-*.js        1.1 KB    ← 路由懒加载
├── Dashboard-*.css       0.5 KB    ← 该路由的样式被一起拆分
├── format-*.js           0.3 KB    ← 动态 import
├── About-*.js / Assets-*.js / NotFound-*.js
└── rolldown-runtime-*.js  0.6 KB    ← Rolldown 的运行时
```

注意 `Dashboard-*.css`：`build.cssCodeSplit` 默认 `true`，异步 chunk 的样式也会被单独拆分，进入该路由时才加载。

## 六、动手步骤

1. 先**不启动** dev，直接看构建产物：

   ```bash
   pnpm build
   ls -lh dist/assets
   ```

2. 记下 `index-*.js` 与 `vendor-*.js` 的体积。

3. 启动 dev：

   ```bash
   pnpm dev
   ```

4. 打开首页，DevTools → Network 筛选 `JS`，记录首屏加载了哪些 chunk。

5. 点击「Dashboard」，观察 Network 新增了 `Dashboard-*.js` 与 `Dashboard-*.css`——首屏没有它。

6. 回到首页，点「动态加载 format 模块」，观察 `format-*.js` 才被请求。

7. 打开 `dist/index.html`，看 `<link rel="modulepreload">`：Vite 会自动为入口依赖加预加载提示。

## 观察点

- 首屏只加载 `index` + `vendor`，Dashboard 相关文件在导航后才出现。
- 路由切换时有短暂的 chunk 请求（本地很快，生产要看网络）。
- `format-*.js` 很小，因为 lodash-es/dayjs 已经在 vendor-utils 里了——**说明分组生效**。

## 检查点

```bash
pnpm build
ls dist/assets/*.js | wc -l          # 应有多个 chunk
ls dist/assets | grep -E "vendor-vue|vendor-utils|Dashboard|format"
```

- [ ] 存在 `vendor-vue-*` 与 `vendor-utils-*`
- [ ] 存在 `Dashboard-*` 与 `Dashboard-*.css`
- [ ] 存在 `format-*`
- [ ] 首屏 Network 不包含 Dashboard chunk

## 常见坑

- **照抄 `manualChunks`** → Vite 8 下对象形式直接失效，且没有报错提示。
- **把所有依赖塞进一个 vendor** → 单文件过大，首屏变慢。
- **拆得太细** → 请求数增加，HTTP/1.1 下尤其明显。
- **动态导入写在条件分支里** → 打包器仍会拆分，但加载时机不直观，注意配合 loading 状态。
- **忘了处理加载失败** → 用户断网/发版后旧 chunk 404，需要用 `router.onError` 或 `import()` 的 catch 兜底。
- **以为 chunk 名固定** → 都带内容 hash，部署后旧文件会被新文件替换，需要保留回滚能力。

## 进阶（可跳过）

- `import.meta.glob('./views/*.vue', { eager: false })`：批量懒加载路由。
- `build.chunkImportMap`：Rolldown 的 import map 输出。
- `modulepreload.polyfill`：老浏览器兼容。
- 阅读：<https://vite.dev/guide/features#dynamic-import>、<https://rolldown.rs/in-depth/manual-code-splitting>

## 对照答案

```bash
git diff ch10 ch11
```
