# 9. API 自动导入与组件按需引入

## 真实场景

在 Vue 项目中反复书写 `import { ref } from 'vue'` 和基础组件导入会产生大量样板代码。自动导入插件可以根据源码中的实际用法补齐模块导入，同时保留明确的模块依赖，供打包器摇树和代码分割使用。

本例实现一个可配置的教学插件：

- `imports`：标识符到模块的映射，例如 `ref → vue`，生成具名导入。
- `components`：组件名到路径的映射，例如 `AutoImportBadge → @/components/auto-import/AutoImportBadge.vue`，生成默认导入。
- `include`：把转换限制在指定的教学 SFC，不影响项目其他源码。
- `dts`：在 `buildStart` 生成最小类型声明，为原始源码中的 API 和模板组件提供编辑器类型提示。

## 核心钩子与数据流

插件位于 `plugins/auto-import/auto-import.ts`，同时使用两个钩子：

1. `buildStart` 根据配置生成 `src/types/auto-import.d.ts`。dev 启动和生产构建都会执行该钩子；内容未变化时不重复写盘。
2. `enforce: 'pre'` 配合 `transform(code, id)`，在 `@vitejs/plugin-vue` 编译前读取原始 SFC。
3. 跳过带 query 的 Vue 子请求并统一路径分隔符，只有匹配 `include` 的主 `.vue` 模块才继续，避免把编译后的脚本当作 SFC 二次转换。
4. 提取 `<script setup>` 和 `<template>`：在脚本中查找 API 用法，在模板中查找组件开始标签。
5. 如果脚本已经声明或导入同名绑定，则不重复注入；否则把导入语句插到 `<script setup>` 开始标签之后。
6. 返回 `{ code, map: null }`，再由 Vue 插件完成 SFC 编译。

核心转换逻辑如下：

```ts
for (const [identifier, module] of Object.entries(options.imports)) {
  if (hasApiUsage(script, identifier) && !hasBinding(script, identifier)) {
    injected.push(`import { ${identifier} } from '${module}'`)
  }
}

for (const [component, path] of Object.entries(options.components)) {
  if (hasComponentUsage(template, component) && !hasBinding(script, component)) {
    injected.push(`import ${component} from '${path}'`)
  }
}

return { code: transformed, map: null }
```

这里不是把变量挂到 `window`，也不是修改浏览器运行时。转换后的代码仍是普通 ESM，后续模块解析、HMR 和生产构建继续走 Vite 标准管线。

## 配置接入

共享配置已经展开 `autoImportPlugins()`，本类只需维护 `plugins/auto-import/index.ts`：

```ts
import type { Plugin } from 'vite'
import { autoImportPlugin } from './auto-import.ts'

export function autoImportPlugins(): Plugin[] {
  return [
    autoImportPlugin({
      include: /\/src\/views\/plugins\/categories\/AutoImportDemo\.vue$/,
      imports: {
        ref: 'vue',
      },
      components: {
        AutoImportBadge: '@/components/auto-import/AutoImportBadge.vue',
      },
      dts: 'src/types/auto-import.d.ts',
    }),
  ]
}
```

`src/views/plugins/categories/AutoImportDemo.vue` 的脚本只有：

```vue
<script setup lang="ts">
const count = ref(0)
</script>
```

模板直接使用 `<AutoImportBadge :count="count" />`，两者都没有手写导入。转换后等价于：

```ts
import { ref } from 'vue'
import AutoImportBadge from '@/components/auto-import/AutoImportBadge.vue'

const count = ref(0)
```

## 类型声明与全局注册的区别

生成的声明包含两部分：

- `declare global` 中的 `ref` 类型，让编辑器理解原始脚本里尚未经过 Vite 转换的标识符。
- `vue` 模块的 `GlobalComponents` 接口，让模板中的组件获得属性类型提示。

**类型声明只服务静态检查，不会提供运行时实现。** 真正让页面运行的是 `transform` 注入的 ESM 导入；删掉转换而只保留 `.d.ts` 会产生未定义变量或无法解析组件。

自动导入也不等于全局自动注册：

| 方式 | 运行时代码 | 依赖与用途 |
| --- | --- | --- |
| 本例自动导入 | 每个使用模块获得局部 import | 依赖图显式，未使用的映射不会进入产物，利于摇树 |
| `app.component()` 全局注册 | 应用启动时注册组件 | 组件通常先进入主包，适合确实跨页面高频使用的基础组件 |

即使本例为模板编辑器补充了 `GlobalComponents` 类型，运行时组件依然是由注入 import 形成的局部绑定，并没有调用 `app.component()`。

## 验证步骤

### dev 页面与 Inspect

```bash
pnpm exec vite --port 5213
```

1. 打开 <http://localhost:5213/plugins/auto-import>。
2. 初始计数为 `0`，自动引入的组件显示同样的计数；点击“点击 +1”，两处应同步更新。
3. 打开 <http://localhost:5213/__inspect/>，搜索 `/src/views/plugins/categories/AutoImportDemo.vue`。
4. 在 TRANSFORM STACK 中选择 `lab:auto-import`，对比输入与输出，应看到新增的两条 import，且它们位于 `vite:vue` 之前。
5. 查看 `src/types/auto-import.d.ts`，确认存在 `ref` 和 `AutoImportBadge` 的最小声明。

也可用 HTTP 响应确认 dev 模块已包含自动导入：

```bash
curl -s http://localhost:5213/src/views/plugins/categories/AutoImportDemo.vue
```

### 构建与文档

```bash
pnpm build
pnpm docs:build
git diff --check
```

生产构建通过说明注入的 Vue API 和组件路径可以完整参与模块解析及打包。开发指南可通过“插件开发指南 → 3. 按需导入 / 自动引入 → 9. API 自动导入与组件按需引入”访问。

## 生产边界与常见坑

这是为固定 SFC 和受控语法设计的最小实现，不应直接处理任意业务仓库：

- **复杂作用域应交给 AST / unplugin。** 当前正则不知道注释、字符串、解构、函数参数、块级阴影、import 别名和复杂重新导出，可能漏判或误判。生产项目应使用 AST 分析作用域，并优先评估 `unplugin-auto-import` 与 `unplugin-vue-components`，不要继续堆正则。
- **SFC 解析也是受控的。** 示例假定单个标准 `<script setup>` 和 `<template>`；多脚本、宏中的特殊语法及自定义块需要真正的 SFC 解析器。
- **导入形式有约束。** API 映射假定“本地标识符就是模块的同名具名导出”，组件映射假定“.vue 默认导出”。重命名导出、命名空间导入等需要扩展配置模型。
- **必须限制处理范围。** 对全仓库做字符串扫描容易改变无关代码，也会增加每次转换成本。生产插件还需要缓存，并准确监听配置和映射来源。
- **`enforce` 顺序不能丢。** 如果等 Vue 编译后才处理，拿到的已不是原始 SFC，注入位置和模板检测都会失效。
- **主 SFC 与子请求要区分。** `?vue&type=script...` 等子请求包含编译后的代码，不能再次按 SFC 转换；Windows 路径还需要把反斜杠规范化后再匹配。
- **重复 import 会导致编译错误。** 转换前必须检查已有绑定；生产方案还需要完整处理别名和不同作用域。
- **`map: null` 是教学简化。** 它表示不提供转换 sourcemap；生产插件应生成或串联 sourcemap，避免调试位置漂移。
- **声明文件不是全局运行时注册。** `.d.ts` 不会改变产物，组件路径也必须能被 TypeScript 和 Vite 同时解析。
- **生成文件需要团队约定。** 可像本例一样提交稳定的最小声明供编辑器直接使用，或把生成目录加入忽略列表；无论哪种方式，都要保证首次启动时生成且 CI 一致。

插件钩子顺序和 Inspect 的基础用法可回看 [ch10 Vite 插件机制](../../guide/ch10-plugins.md)。
