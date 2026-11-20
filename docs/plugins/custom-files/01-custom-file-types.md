# 22. 自定义文件类型：Markdown / GraphQL / CSV

[返回插件场景附录](../appendix-plugin-scenarios.md) · [回顾 ch10 插件机制](../../guide/ch10-plugins.md)

## 真实场景

业务仓库里并非所有模块都应该是 `.ts` 或 `.vue`：

- 文档作者维护 Markdown，应用把它直接渲染成 Vue 组件；
- 前端与后端共享 `.graphql` 文档，构建时导出文档字符串和操作名；
- 运营或数据同学维护小型 CSV，页面直接导入结构化行，而不是运行时再请求和解析。

这些需求的共同点不是“浏览器认识了新扩展名”，而是 **Vite 在模块管线中把受控源文件转换成标准 ESM，后续 import、HMR、代码分割和生产构建继续复用原有能力**。

本条目在 `plugins/custom-files/custom-file-types.ts` 中实现一个最小教学插件，只处理 `src/plugin-lab/fixtures/custom-files/` 下的三个 fixture，不引入依赖、不访问网络，也不把它伪装成通用编译器。

## 核心钩子与数据流

```text
lesson.md
  └─ resolveId：受控 .md → 虚拟 lesson.md.vue
     └─ load：读取 Markdown → 转义并生成 Vue SFC
        └─ @vitejs/plugin-vue：SFC → 标准 Vue 组件模块

viewer.graphql
  └─ transform：原始文档 + operationName → ESM

team.csv
  └─ transform：表头 + 记录对象 → ESM

任一 fixture 变化
  └─ handleHotUpdate：失效对应模块并发送 full-reload
```

插件使用 `enforce: 'pre'`。这对 `@/plugin-lab/.../lesson.md` 很重要：如果排在 Vite alias 之后，alias 会先把 `@/` 解析成真实 `.md` 路径并结束 `resolveId`，本插件就没有机会把它映射成 `.md.vue`。

Markdown 的虚拟 ID 故意保留文件形态而不是加 `\0`，因为下一步要让 `@vitejs/plugin-vue` 的 `.vue` 过滤器接管。Vue 后续产生的 `?vue&type=...` 子模块请求也不能再被本插件的 `load` 截获。

## 配置接入与页面导入

共享配置已经展开 `customFilePlugins()`，本类只需在自己的入口注册插件：

```ts
// plugins/custom-files/index.ts
import { customFileTypesPlugin } from './custom-file-types.ts'

export function customFilePlugins() {
  return [customFileTypesPlugin()]
}
```

页面像导入普通模块一样使用三种文件：

```ts
import MarkdownArticle from '@/plugin-lab/fixtures/custom-files/lesson.md'
import {
  document as queryDocument,
  operationName,
} from '@/plugin-lab/fixtures/custom-files/viewer.graphql'
import { headers, rows } from '@/plugin-lab/fixtures/custom-files/team.csv'
```

对应声明位于 `src/types/custom-files.d.ts`：`.md` 默认导出 Vue 组件，`.graphql` 导出文档与 `string | null` 操作名，`.csv` 导出 `headers` 和 `Array<Record<string, string>>` 数据行。

演示组件为 `src/views/plugins/categories/CustomFileDemo.vue`，路由是 `/plugins/custom-files-demo`。这里使用 `-demo` 后缀，是因为 dev server 的 `/plugins/custom-files` 会命中根目录下的真实 `plugins/custom-files/` 目录，而不是 SPA history fallback。

## 最小实现

### 1. 先限定处理范围

插件通过 fixture 绝对目录和扩展名双重判断处理范围，`?raw`、`?url` 等显式资源请求保持 Vite 原行为。GraphQL 和 CSV 的 `transform` 也跳过带 query 的 ID。

这个白名单是教学示例的重要边界：不要因为插件叫“Markdown loader”，就无意转换文档站、README 或 `node_modules` 里的所有 `.md` 文件。

### 2. Markdown → Vue SFC

`resolveId` 先通过 `this.resolve(source, importer, { skipSelf: true })` 复用 alias 和默认解析，再为受控结果追加虚拟 `.vue` 后缀；dev 的 `?import` 查询会保留。`load` 读取真实 Markdown，返回下面的 SFC 形态：

```vue
<template>
  <article class="markdown-body">
    <h1>Markdown 已成为 Vue 组件</h1>
    <p>这段文字来自 lesson.md。</p>
  </article>
</template>
```

教学解析器只支持：

- 一至三级标题；
- 段落和无序列表；
- 以三个反引号包裹的代码块，未闭合围栏会报错。

不支持嵌套列表、表格、链接、图片、原始 HTML、行内强调等语法；这些字符只会作为文本显示。`load` 中的 `this.addWatchFile(markdownFile)` 把真实 `.md` 加入监听，因为模块 ID 已变成虚拟 `.md.vue`。

**转义是两道防线，不只是一道：**

1. `& < > " '` 转成 HTML 实体，原始 `<script>` 不会变成元素；
2. `{` 和 `}` 也转成实体，避免 Markdown 中的 <code v-pre>{{ ... }}</code> 进入 SFC 后被 Vue 当成插值表达式。

生成的 HTML 不使用 `v-html`。fixture 中同时放入 `<script>alert('不会执行')</script>` 和 <code v-pre>{{ 1 + 1 }}</code>，页面应原样显示文本，不能弹窗，也不能显示计算结果 `2`。

### 3. GraphQL → 文档模块

`transform` 用 `JSON.stringify` 安全生成字符串字面量，并从受控文档中读取第一个命名 operation：

```js
export const document = 'query CustomFileViewer { ... }'
export const operationName = 'CustomFileViewer'
export default { document, operationName }
```

匿名操作得到 `null`。这里不解析 selection set、不处理 fragment、不校验 schema，也不发送请求；页面的 `<pre>` 只是展示导出的原始文档。

### 4. CSV → 数据模块

一个逐字符状态机处理逗号、字段引号、引号内逗号、双引号转义和 CRLF。解析后校验：

- 文件和表头不能为空，表头不能重复；
- 每行列数必须与表头一致；
- 引号必须闭合，闭合引号后只能出现逗号或换行。

默认导出是按表头键索引的记录数组，同时保留 `headers` 供表格渲染：

```js
export const headers = ['name', 'role', 'note']
export const rows = [
  { name: '林,晓', role: '前端', note: '逗号会保留在字段中' },
]
export default rows
```

生成 JS 时同样使用 `JSON.stringify`，不要手工拼接带引号的源文本。

### 5. HMR 与 sourcemap

`handleHotUpdate` 只匹配同一 fixture 目录。Markdown 会额外查找虚拟 `.md.vue` 模块；随后失效受影响模块，并通过 `server.ws.send({ type: 'full-reload', path: '*' })` 整页刷新。这样可以明确验证三种文件的变化，同时把细粒度组件状态保留留给生产实现。

三个转换入口都返回 `map: null`。Vue 生成的 map 描述的是“中间 SFC → 组件 JS”，并不等同于“原始 Markdown → 组件 JS”；GraphQL 和 CSV 也没有原始行列映射。不要把这种行为描述成完整 sourcemap 支持。

## dev 验证

在项目根目录启动本条目服务：

```bash
pnpm exec vite --port 5217
```

打开 <http://localhost:5217/plugins/custom-files-demo>，逐项检查：

1. Markdown 标题、列表、代码块正常渲染，原始 `<script>` 和 <code v-pre>{{ 1 + 1 }}</code> 按文本显示；
2. GraphQL 面板显示 `operationName: CustomFileViewer` 和原始查询，没有网络请求；
3. CSV 表格有三行，`林,晓` 保留逗号，`他说 "先验证，再发布"` 的引号正确还原；
4. 打开 <http://localhost:5217/__inspect/>，搜索 `lesson.md.vue`、`viewer.graphql` 和 `team.csv`，分别观察 `load` / `transform` 结果。

也可以直接请求 dev 转换模块。`?import` 表示按 ESM 请求，避免静态中间件直接返回源文件：

```bash
curl -fsS 'http://localhost:5217/src/plugin-lab/fixtures/custom-files/lesson.md?import'
curl -fsS 'http://localhost:5217/src/plugin-lab/fixtures/custom-files/viewer.graphql?import'
curl -fsS 'http://localhost:5217/src/plugin-lab/fixtures/custom-files/team.csv?import'
curl -fsS -H 'Accept: text/html' http://localhost:5217/plugins/custom-files-demo
```

预期第一条是 Vue 组件 JS，第二条含 `operationName = "CustomFileViewer"`，第三条含结构化 `headers` / `rows`，最后是应用 `index.html`。

**验证 HMR：** 保持服务和页面打开，依次做三次小编辑，并在每次观察后还原：

- 在 `lesson.md` 增加一个普通段落，页面整页刷新并出现新段落；
- 把 `viewer.graphql` 的 `CustomFileViewer` 改为 `CustomFileViewerHmr`，操作名随刷新更新；
- 把 `team.csv` 的 `普通字段` 改为 `HMR 字段`，对应单元格随刷新更新。

最后确认 `git diff -- src/plugin-lab/fixtures/custom-files/` 没有遗留验证改动。

## build 与文档验证

```bash
pnpm build
pnpm docs:build
git diff --check
```

`pnpm build` 必须同时完成原主入口和 lazy-loaded `CustomFileDemo` chunk。构建后可继续断言三种内容确实进入该 chunk，而原始脚本哨兵没有成为 HTML 标签：

```bash
grep -RE 'Markdown 已成为 Vue 组件|CustomFileViewer|林,晓' \
  dist/assets/CustomFileDemo-*.js

if grep -R "<script>alert('不会执行')" dist/assets/CustomFileDemo-*.js; then
  echo '发现未转义 Markdown 脚本' >&2
  exit 1
fi
```

如需检查生产路由，再运行 `pnpm preview --port 4217` 并打开 <http://localhost:4217/plugins/custom-files-demo>。生产环境不会启动 dev 转换服务，三种模块已在构建时编入 chunk。

## 生产级实现还需补齐什么

| 方向 | 教学实现边界 | 生产实现建议 |
| --- | --- | --- |
| Markdown AST | 逐行解析固定子集，不理解嵌套块、行内 span、链接与 HTML | 使用 `remark` / `markdown-it` 等完整 parser，基于 AST 生成目标代码；需要 SFC 脚本改写时再使用 SFC parser 和 JS AST |
| Markdown 安全 | 固定标签由插件生成，文本和 Vue 定界符转义 | 明确原始 HTML 策略，使用成熟的 sanitize 白名单；处理链接协议、图片、属性、指令和 SSR 上下文，不能把本示例当通用 sanitizer |
| GraphQL AST | 正则提取第一个操作名，不解析语法或 fragment | 使用 `graphql` parser / `graphql-tag`，处理多 operation、匿名 operation、fragment、schema 校验、类型生成或 persisted query |
| CSV parser | 单文件全量读入，固定逗号方言，严格报错 | 选择成熟 CSV parser，补充编码、分隔符、空行、大文件流式处理、行列错误定位和大小限制；再导出电子表格时还要考虑公式注入 |
| sourcemap | `map: null`，只保留 Vue 对中间 SFC 的映射 | 利用 AST 的位置信息和 `MagicString` / source-map 库生成并合并原始文件映射，在 dev 和 build 分别验证 |
| HMR | 三种文件统一整页刷新 | 根据 importer 和模块接受边界做精细失效；Markdown 组件需要与 Vue HMR 描述符和状态保留策略协作 |
| 输入边界 | 只处理仓库内受控 fixture | 不直接接收不可信上传；增加大小/深度限制、真实路径与符号链接检查、结构化错误和 schema 校验 |

这些不是“以后可优化的细节”，而是把受控教学 loader 推广到用户输入前必须重新设计的能力。

## 常见坑

- **alias 导入没有进入 `resolveId`：** 检查插件是否 `enforce: 'pre'`，并用 `skipSelf` 避免递归。
- **Markdown 生成了 SFC 却仍报“invalid JS”：** `.md` 还没有进入 Vue 编译管线；本例通过虚拟 `.vue` 后缀复用现有插件，不是简单返回 `<template>` 就结束。
- **拦截了 `?vue&type=template`：** 子模块应交给 `@vitejs/plugin-vue`，否则主组件与 template block 会互相覆盖。
- **直接 `curl file.csv` 得到源文本：** dev 静态资源请求不等于模块转换请求，按模块验证时添加 `?import`。
- **只转义 `<` 仍出现意外 Vue 表达式：** 进入 SFC 的文本还要处理 <code v-pre>{{</code> / <code v-pre>}}</code>。
- **手写 JS 字符串导致引号或换行破坏模块：** 用 `JSON.stringify` 生成字面量。
- **构建成功就认为 sourcemap 完整：** 当前项目生产 sourcemap 默认关闭，且 `map: null` 明确表示本教学转换没有提供原始映射。
- **把 GraphQL 文档导出当成请求客户端：** 本插件没有 endpoint、鉴权、缓存、错误重试或响应处理，这些属于数据请求层。
