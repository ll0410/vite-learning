# 附录：开发必备插件清单

本附录按「几乎必装 / 强烈推荐 / 按需」分三档，标注了本仓库的现状，方便对照补齐。

> 通用原则：**插件是长期维护成本**。装之前先看 `peerDependencies` 是否覆盖 `vite@^8`，网上大量插件的文档仍停留在 Vite 4/5。

## 一、几乎必装

| 插件 | 作用 | 本项目 |
| --- | --- | --- |
| `@vitejs/plugin-vue` / `@vitejs/plugin-react` | 框架编译，没有它 SFC/JSX 无法工作 | 已有 |
| `unplugin-auto-import` | 自动引入 `ref`、`computed`、`useRouter` 等，省掉大量 import | 待补 |
| `unplugin-vue-components` | 组件自动注册，配合 UI 库做按需加载 | 待补 |
| `unplugin-icons` | 基于 Iconify 的图标按需引入 | 待补 |
| `vite-plugin-inspect` | 可视化插件管线，见 [ch10](../guide/ch10-plugins.md) | 已有（仅 dev） |

`unplugin-*` 是同一套代码适配 Vite / webpack / Rollup，换构建工具不用重写，因此成了事实标准。

```bash
pnpm add -D unplugin-auto-import unplugin-vue-components unplugin-icons
```

`unplugin-icons` 还需要图标数据源，按需二选一：

```bash
pnpm add -D @iconify/json        # 全量图标，约 100MB，按需读取
pnpm add -D @iconify-json/mdi    # 只装某个图标集，体积小
```

## 二、强烈推荐

| 插件 | 作用 | 什么时候装 |
| --- | --- | --- |
| `vite-plugin-checker` | dev 时后台跑 TS / ESLint / Stylelint，错误直接浮在页面上 | 团队协作、中大型项目 |
| `vite-plugin-vue-devtools` | 把 Vue DevTools 集成进页面 | Vue 项目；本项目已有 `@vitejs/devtools`，可不装 |
| `rollup-plugin-visualizer` | 产物体积分析 | 已有，`pnpm build:analyze` 时启用 |
| `vite-plugin-compression2` | 预生成 `.gz` / `.br` | 已有；**服务端已开压缩就不需要** |

`vite-plugin-checker` 值得单独说：它把类型检查从 CI 提前到本地每次保存，避免「提交了才发现类型错」。它和 `vue-tsc` 是互补关系——CI 仍要跑 `vue-tsc --noEmit`。

```bash
pnpm add -D vite-plugin-checker
```

```ts
// vite.config.ts
import checker from 'vite-plugin-checker'

checker({
  typescript: true,
  eslint: { lintCommand: 'eslint "./src/**/*.{ts,vue}"' },
  overlay: { initialIsOpen: false },
})
```

## 三、按需

| 插件 | 场景 |
| --- | --- |
| `unplugin-vue-router` | 目录约定式路由，替代手写路由表 |
| `vite-plugin-mock-dev-server` / `MSW` | Mock 数据；**优先 MSW**，dev 与测试共用一套 |
| `@vitejs/plugin-legacy` | 兼容不支持 ESM 的老浏览器，会显著增大产物 |
| `vite-plugin-pwa` | 离线缓存、Service Worker |
| `vite-svg-loader` | 把 SVG 当 Vue 组件使用 |
| `unplugin-dts` | 写组件库 / npm 包时生成 `.d.ts` |
| `vite-plugin-image-optimizer` | 构建期压缩图片 |
| `vite-plugin-html` | 多页应用、复杂 HTML 注入 |

注意 `mock-api`：本章手写的 `plugins/mock-api.ts` 只适合学习和小项目；真实项目建议用 MSW，因为它的 handler 能在单元测试里复用。

## 四、反模式

- **别装 `vite-plugin-eslint`**：已废弃。用 `vite-plugin-checker` 或直接在 `scripts` 里跑 ESLint。
- **别同时装多个体积分析插件**：`rollup-plugin-visualizer` 一个够用。
- **别把 `inspect` 带进生产构建**：用 `apply: 'serve'` 或 `command === 'serve'` 包一层。
- **别为「可能用到」装插件**：每个插件都要跟进 Vite 大版本升级。
- **别忽略 `peerDependencies`**：只声明到 Vite 5/6 的老插件，在 Vite 8 下可能直接报错或行为异常。

## 五、装插件前的检查清单

1. `peerDependencies.vite` 是否包含 `^8`？没有就去 issue 区确认。
2. 是否只在 dev 用？是的话加 `apply: 'serve'`。
3. 是否只在 build 用？是的话加 `apply: 'build'`。
4. 是否引入了 Node 内置模块？插件跑在 Node，不能依赖浏览器 API。
5. 安装后跑一次 `pnpm dev` 与 `pnpm build`，确认两种模式都正常。

## 六、本项目建议动作

1. 补 `unplugin-auto-import` + `unplugin-vue-components` + `unplugin-icons`，减少样板代码。
2. 补 `vite-plugin-checker`，把类型与规范检查前移到 dev。
3. 其余插件按后续章节进度再引入，不要一次性堆满。

插件机制本身见 [ch10 插件机制](../guide/ch10-plugins.md)，Vite 8 的底层变化见 [附录：Vite 8 的关键变化](../guide/appendix-vite8-changes.md)。
