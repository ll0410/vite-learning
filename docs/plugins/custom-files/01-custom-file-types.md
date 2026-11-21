# 22. 自定义文件类型：Markdown / GraphQL / CSV

[返回插件场景附录](../appendix-plugin-scenarios.md) · [回顾 ch10 插件机制](../../guide/ch10-plugins.md)

## 先看懂：文件怎样变成页面可以导入的模块

业务仓库里并非所有内容都适合直接写成 `.ts` 或 `.vue`：文档作者可能维护 Markdown，前后端可能共享 GraphQL 文档，运营或数据同学可能维护小型 CSV。本例让应用直接导入这三类文件，而不是在浏览器里再请求并解析文本。

社区常把这类转换工具称为“自定义 loader”。通俗地说，它就是**在 Vite 读取模块的过程中，把一种文本转换成另一种模块代码的插件**。转换之后，应用拿到的仍是标准 ES 模块（能用 `import` / `export` 的 JavaScript）或 Vue 组件，因此可以继续使用依赖分析、代码分割和生产构建。

这里会反复出现“模块 ID”。它是 Vite 在模块管线中标识一个模块的字符串，通常看起来像文件路径，也可能带查询参数。例如本例把真实的 `lesson.md` 映射成 `lesson.md.vue`；后者是让 Vue 插件接管的合成 ID，并不表示磁盘上真的新建了这个文件。

本例完整实现位于 `plugins/custom-files/custom-file-types.ts`，只处理 `src/plugin-lab/fixtures/custom-files/` 下固定的示例输入文件（fixture），不引入额外解析依赖，也不访问外部服务。

```text
受控目录中的 Markdown / GraphQL / CSV
        ↓ Vite 插件读取并转换
Vue 组件模块 / JavaScript 数据模块
        ↓ 普通 import
CustomFileDemo.vue
        ↓
页面上的文章、GraphQL 文档和 CSV 表格
        ↓ 生产构建
路由按需加载的 CustomFileDemo chunk
```

这里的 chunk 指构建时拆分出的 JavaScript 产物文件；演示页通过动态 import 在访问时加载自己的 chunk。

下面分别走完三条“输入文件 → 转换后的模块 → 消费者 → 页面结果”链路。消费者代码都摘自 `src/views/plugins/categories/CustomFileDemo.vue`，每个片段只保留当前示例相关的 import 和模板，省略其他面板与样式。

## 核心示例

### 示例一：Markdown → Vue 组件

#### 1. 输入：一个 Markdown 文件

`src/plugin-lab/fixtures/custom-files/lesson.md` 的完整内容如下。外层使用四个反引号，只是为了在本文中完整展示文件自身的三反引号代码围栏。

````md
# Markdown 已成为 Vue 组件

这段文字来自 lesson.md，插件生成 SFC 后再交给 Vue 编译。

## 支持的最小子集

- 一至三级标题
- 段落与无序列表
- 围栏代码块

### 默认转义

<script>alert('不会执行')</script> 与 {{ 1 + 1 }} 都只按文本展示。

```ts
const source = 'lesson.md'
```
````

#### 2. 转换：先生成 Vue SFC，再交给 Vue 编译

这里的解析器是把文本识别为标题、段落、列表和代码块的小程序。本例的 `markdownToSfc` 逐行识别上述固定语法，生成下面的 Vue 单文件组件（SFC）源码。这是当前 fixture 的**完整中间结果，没有省略内容**：

```vue
<template>
  <article class="markdown-body">
    <h1>Markdown 已成为 Vue 组件</h1>
    <p>这段文字来自 lesson.md，插件生成 SFC 后再交给 Vue 编译。</p>
    <h2>支持的最小子集</h2>
    <ul>
      <li>一至三级标题</li>
      <li>段落与无序列表</li>
      <li>围栏代码块</li>
    </ul>
    <h3>默认转义</h3>
    <p>&lt;script&gt;alert(&#39;不会执行&#39;)&lt;/script&gt; 与 &#123;&#123; 1 + 1 &#125;&#125; 都只按文本展示。</p>
    <pre><code>const source = &#39;lesson.md&#39;</code></pre>
  </article>
</template>
```

这段 SFC 还不是浏览器最终执行的组件 JavaScript。`@vitejs/plugin-vue` 会继续编译 `<template>`，这一点在后面的钩子链路中展开。

注意两种转义同时存在：`&lt;script&gt;` 防止文本变成 HTML 元素，`&#123;` 和 `&#125;` 防止双花括号进入 SFC 后被 Vue 当作插值表达式。插件没有把不可信文本塞进 `v-html`。

#### 3. 消费：像组件一样导入和渲染

```vue
<script setup lang="ts">
import MarkdownArticle from '@/plugin-lab/fixtures/custom-files/lesson.md'
</script>

<template>
  <MarkdownArticle class="markdown-preview" />
</template>
```

页面不需要自己解析 Markdown，也不需要 `v-html`。默认导出已经是 Vue 组件，所以可以像其他组件一样写进模板。

#### 4. 结果：看到文章，而不是脚本或表达式执行结果

页面会显示标题、三个列表项和代码块。`<script>alert('不会执行')</script>` 与 <code v-pre>{{ 1 + 1 }}</code> 都按文本展示：不会弹窗，也不会把表达式显示为 `2`。生产构建时，这个组件会随演示页面进入对应 chunk。

### 示例二：GraphQL → 文档模块

#### 1. 输入：一段保存为文件的 GraphQL 文档

`src/plugin-lab/fixtures/custom-files/viewer.graphql` 的完整内容如下。`query CustomFileViewer` 表示一个名为 `CustomFileViewer` 的查询操作。

```graphql
# 这个受控文档不会被插件校验或执行。
query CustomFileViewer {
  viewer {
    id
    displayName
  }
}
```

#### 2. 转换：导出原始文档和操作名

插件用正则表达式（按文本模式匹配）找到第一个命名操作，并用 `JSON.stringify` 把原文变成安全的 JavaScript 字符串字面量。当前 fixture 生成的完整模块如下；字符串中的 `\n` 表示换行：

```js
export const document = "# 这个受控文档不会被插件校验或执行。\nquery CustomFileViewer {\n  viewer {\n    id\n    displayName\n  }\n}\n";
export const operationName = "CustomFileViewer";
export default { document, operationName };
```

它同时提供命名导出和默认导出，页面使用的是前两个命名导出。这里只转换文本：不解析字段选择集，不处理 fragment（可复用字段片段），不按 schema（接口类型约定）校验，也不发送 GraphQL 查询。

#### 3. 消费：把字符串绑定到页面

```vue
<script setup lang="ts">
import {
  document as queryDocument,
  operationName,
} from '@/plugin-lab/fixtures/custom-files/viewer.graphql'
</script>

<template>
  <p>operationName：<code data-testid="operation-name">{{ operationName ?? '匿名操作' }}</code></p>
  <pre class="query"><code>{{ queryDocument }}</code></pre>
</template>
```

`document` 容易与 DOM 的全局 `document` 混淆，因此源码导入时起别名为 `queryDocument`，让模板中的用途更清楚。`operationName` 为 `null` 时，模板会显示“匿名操作”。

#### 4. 结果：页面展示文档，不产生 API 数据查询

页面显示 `operationName：CustomFileViewer`，下方 `<pre>` 展示包含注释在内的原始文档。没有 GraphQL endpoint、请求头、鉴权或响应处理，因此不会发生 GraphQL API 数据查询。开发环境下加载 `viewer.graphql` **模块本身**仍有正常的 HTTP 请求，不要把这两件事混为一谈。

### 示例三：CSV → 表头和记录数组

#### 1. 输入：带引号逗号与双引号转义的 CSV

`src/plugin-lab/fixtures/custom-files/team.csv` 的完整内容如下：

```csv
name,role,note
"林,晓",前端,"逗号会保留在字段中"
周宁,构建,"他说 ""先验证，再发布"""
陈晨,文档,普通字段
```

`"林,晓"` 中的逗号属于字段内容；成对的 `""` 在带引号字段中表示一个字面量双引号。

#### 2. 转换：每行变成以表头为键的对象

CSV 解析器逐字符记录“是否在引号内”“引号是否刚闭合”等状态。当前 fixture 生成的完整模块如下：

```js
export const headers = ["name","role","note"];
export const rows = [{"name":"林,晓","role":"前端","note":"逗号会保留在字段中"},{"name":"周宁","role":"构建","note":"他说 \"先验证，再发布\""},{"name":"陈晨","role":"文档","note":"普通字段"}];
export default rows;
```

所有单元格都保持字符串。命名导出 `headers` 用来生成表头，`rows` 用来生成数据行；默认导出与 `rows` 是同一个数组。

#### 3. 消费：用两组 `v-for` 渲染表格

```vue
<script setup lang="ts">
import {
  headers,
  rows,
} from '@/plugin-lab/fixtures/custom-files/team.csv'
</script>

<template>
  <table>
    <thead>
      <tr>
        <th v-for="header in headers" :key="header">{{ header }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.name">
        <td v-for="header in headers" :key="header">{{ row[header] }}</td>
      </tr>
    </tbody>
  </table>
</template>
```

外层循环每次取一行对象，内层循环按照 `headers` 的顺序读取 `row[header]`。因此列顺序由 CSV 表头决定，而不是由对象属性的书写顺序决定。

#### 4. 结果：三行数据保留原始标点

页面表格有 `name`、`role`、`note` 三列和三行数据：第一行姓名是 `林,晓`，第二行备注是 `他说 "先验证，再发布"`，第三行备注是 `普通字段`。应用没有额外的运行时 CSV 数据请求或 CSV 文本解析步骤，数据已经进入 JavaScript 模块；开发环境仍会正常请求转换后的 `team.csv` 模块。

## 实现原理：钩子怎样串起三条链路

看完输入和输出，再读 `plugins/custom-files/custom-file-types.ts` 会容易得多：

| 任务 | 源码入口 | 作用 |
| --- | --- | --- |
| 限定处理范围 | `FIXTURE_ROOT`、`isControlledFile` | 只接受受控目录内的文件，排除目录外路径 |
| Markdown 改名并读取 | `resolveId`、`load` | 把真实 `.md` 映射为合成 `.md.vue` ID，读取原文并返回 SFC |
| Markdown 编译为组件 | `@vitejs/plugin-vue` | 接管合成 `.vue` 模块及其模板子模块 |
| GraphQL / CSV 转换 | `transform`、`parseCsv` | 把已加载的文本替换为带导出的 JavaScript |
| 文件变化后的更新 | `addWatchFile`、`handleHotUpdate` | 关联真实文件与派生模块，失效旧模块并整页刷新 |

### 1. 白名单先于扩展名转换

插件不是“见到任意 `.md` / `.graphql` / `.csv` 就转换”。`FIXTURE_ROOT` 根据当前模块 URL 定位 fixture 绝对目录，`isControlledFile` 再结合扩展名和 `relative` 的返回结果判断文件是否仍在目录内。因此，同名 README、`node_modules` 内容或目录外文件不会因为这份教程而被批量转换。

`?raw`、`?url` 等显式资源请求也保留给 Vite 原有资源管线。后文验证使用的 `?import` 是开发期“按 ES 模块请求”的方式，不等于把文件作为 raw 文本或 URL 导出。

### 2. Markdown 为什么需要 `resolveId` 和 Vue 插件接力

Markdown 的数据流比其他两种文件多一步，因为插件生成的是 SFC，而浏览器不能直接把 `<template>` 当作 JavaScript 执行：

```text
import '@/.../lesson.md'
  ↓ resolveId
this.resolve(..., { skipSelf: true }) 复用 alias 和普通路径解析
  ↓ 得到真实 lesson.md 后追加 .vue
合成模块 ID：/absolute/path/lesson.md.vue
  ↓ load
读取真实 lesson.md，返回 markdownToSfc(source)
  ↓ @vitejs/plugin-vue
把 SFC 主模块与 ?vue&type=... 子模块编译成 Vue 组件 JavaScript
```

`@` 是 `vite.config.ts` 配置的路径别名（alias），指向 `src`。`resolveId` 不手工替换 `@/`，而是调用 `this.resolve(request, importer, { skipSelf: true })`；`skipSelf` 防止再次进入当前插件造成递归。开发期允许的 `?import` 查询也会保留到合成 ID 中。

这里的合成 ID 故意以 `.vue` 结尾且不加 `\0` 前缀，因为下一步正是要让 Vue 插件的 `.vue` 过滤器识别它。反过来，本插件的 `load` 遇到 `?vue` 请求必须返回，让 Vue 插件处理自己的模板等子模块，不能再次用 Markdown 原文覆盖它们。

`load` 中的 `this.addWatchFile(markdownFile)` 把真实 `.md` 登记为依赖。否则模块图只看到合成 `.md.vue`，真实源文件的变化就难以关联回来。

教学解析器只支持一至三级标题、段落、无序列表和围栏代码块；未闭合代码围栏会抛出带 `lab:custom-file-types` 前缀的错误。嵌套列表、表格、链接、图片、原始 HTML、行内强调等语法不会被实现，相关字符只会作为文本显示，代码围栏后的语言标记也不会转化为高亮 class。

### 3. GraphQL 与 CSV 共用一个 `transform`，但转换规则不同

`transform(code, id)` 在文件内容加载后收到文本和模块 ID：

- 对受控 `.graphql`，正则提取第一个 `query`、`mutation` 或 `subscription` 的名称；匿名操作得到 `null`。`document` 始终是未经校验的原始字符串。
- 对受控 `.csv`，`parseCsv` 处理 UTF-8 BOM（文件开头标记）、CRLF（Windows 风格换行）、字段引号、引号内逗号与换行，以及双引号转义，再返回 `{ headers, rows }`。
- 两处都用 `JSON.stringify` 生成 JavaScript 字符串和数组，避免手工拼接时被引号、反斜杠或换行破坏。

CSV 解析不是“遇到逗号就 `split(',')`”，它还会明确拒绝这些输入：空文件、空表头或重复表头、数据行列数不一致、未闭合引号、闭合引号后出现逗号或换行之外的字符，以及非字段开头出现的引号。

### 4. HMR 为什么统一整页刷新

HMR（Hot Module Replacement，模块热更新）用于在开发时更新变化模块，但本例选择了更简单的整页刷新。`handleHotUpdate` 只处理同一受控目录中的文件变化。它先收集 Vite 已关联的模块；Markdown 还会通过 ``server.moduleGraph.getModulesByFile(`${file}.vue`)`` 找出合成组件模块。随后逐项 `invalidateModule`，丢弃旧转换结果，并发送：

```ts
server.ws.send({ type: 'full-reload', path: '*' })
```

因此本例的热更新表现是**整页刷新**，不是保留组件状态的细粒度 HMR。这样能让三种派生模块都重新执行转换，但页面中的临时状态也会随刷新丢失。

三个转换入口都返回 `map: null`，表示本插件没有提供“原始 Markdown / GraphQL / CSV → 最终 JavaScript”的完整 source map（源码位置映射）。Vue 对中间 SFC 的映射，或开发响应中后续生成的 `sourceMappingURL`，都不能被描述成原始文件的完整映射。

## 配置接入：插件、页面路由与类型声明

### 1. 注册插件，并保持与 Vue 插件的接力关系

`plugins/custom-files/index.ts` 将本例放进共享插件列表：

```ts
import type { Plugin } from 'vite'
import { customFileTypesPlugin } from './custom-file-types.ts'

/** 返回自定义文件转换示例的插件列表，供 Vite 配置统一注册。 */
export function customFilePlugins(): Plugin[] {
  return [customFileTypesPlugin()]
}
```

`vite.config.ts` 已在配置中导入并展开 `customFilePlugins()`。下面只摘录插件数组的相关顺序，省略其他插件和配置：

```ts
plugins: [
  vue(),
  // ...其他插件
  ...customFilePlugins(),
  // ...其他插件
  inspect(),
],
```

不能只看数组中的先后：本插件声明了 `enforce: 'pre'`，会按 Vite 的插件排序规则提前参与模块处理；Markdown 返回 SFC 后，再由 `vue()` 完成 Vue 模板编译。`inspect()` 则提供后文使用的开发期转换检查页面。

### 2. 页面路由按需加载消费者

`src/plugin-lab/routes/custom-files.ts` 定义了真实演示路由，并由 `src/plugin-lab/routes/index.ts` 展开进插件实验室路由数组：

```ts
{
  path: '/plugins/custom-files-demo',
  name: 'plugin-custom-files',
  component: () => import('@/views/plugins/categories/CustomFileDemo.vue'),
}
```

动态 import 让页面及其三种输入模块在生产构建时进入按需加载的 chunk，而不是全部塞进首屏入口。

### 3. 类型声明只帮助 TypeScript 理解导入

“类型声明”是告诉 TypeScript 和编辑器“某个模块有哪些导出、值是什么类型”的代码，不会在浏览器里执行，也不会代替 Vite 插件完成转换。`src/types/custom-files.d.ts` 描述了三种导入：

| 导入形式 | 声明提供的类型 |
| --- | --- |
| `*.md` 默认导出 | Vue `DefineComponent` |
| `*.graphql` | `document: string`、`operationName: string \| null` 及同形默认导出 |
| `*.csv` | `headers: string[]`、`rows: Array<Record<string, string>>`，默认导出 `rows` |

`tsconfig.json` 的 `include` 已覆盖 `src/**/*.d.ts`，所以页面导入时能获得类型检查。注意这些是通配类型声明，而运行时插件只转换 fixture 白名单；声明存在并不意味着目录外的同名扩展名也突然可被 Vite 导入。

## 验证步骤

### 1. 启动开发服务并检查页面

在项目根目录运行：

```bash
pnpm exec vite --port 5217 --strictPort
```

预期终端显示 `Local: http://localhost:5217/`。`--strictPort` 让端口被占用时直接报错，避免命令看似成功、实际却换到了另一个端口。

打开 <http://localhost:5217/plugins/custom-files-demo>，应看到：

1. Markdown 标题、三个列表项和代码块；原始脚本标签与 <code v-pre>{{ 1 + 1 }}</code> 按文本显示，没有弹窗或计算结果 `2`。
2. GraphQL 面板显示 `operationName：CustomFileViewer` 和带首行注释的原始查询；没有向 GraphQL API 发送数据查询。
3. CSV 表格有三列、三行，`林,晓` 保留逗号，`他说 "先验证，再发布"` 保留双引号。

### 2. 直接检查开发期模块响应

```bash
curl -fsS 'http://localhost:5217/src/plugin-lab/fixtures/custom-files/lesson.md?import'
curl -fsS 'http://localhost:5217/src/plugin-lab/fixtures/custom-files/viewer.graphql?import'
curl -fsS 'http://localhost:5217/src/plugin-lab/fixtures/custom-files/team.csv?import'
curl -fsS -H 'Accept: text/html' 'http://localhost:5217/plugins/custom-files-demo'
```

预期结果分别如下：

- 第一条返回 Vue 编译后的组件 JavaScript，可看到 `_sfc_render`、文章标题和转义后的脚本哨兵；它不是前面的 SFC 中间源码。
- 第二条包含 `export const operationName = "CustomFileViewer";`，`document` 字符串保留 `\n`。
- 第三条包含 `export const headers = ["name","role","note"];`、三条结构化记录和 `export default rows;`。
- 第四条返回应用 `index.html`，可看到 `<div id="app">` 和 `/src/main.ts`。这是客户端渲染应用的 HTML 入口，不会直接在 curl 响应中包含渲染后的三行表格。

也可以打开 <http://localhost:5217/__inspect/>，搜索 `lesson.md.vue`、`viewer.graphql` 和 `team.csv`：前者重点对照本插件 `load` 的 SFC 与 Vue 后续转换，后两者查看 `transform` 生成的导出。

### 3. 验证文件变化后的整页刷新

保持服务和页面打开，每次只做一个修改，观察后再还原：

| 文件 | 临时修改 | 可观察结果 |
| --- | --- | --- |
| `lesson.md` | 在末尾增加一个普通段落 | 页面整页刷新，文章末尾出现新段落 |
| `viewer.graphql` | 将 `CustomFileViewer` 改为 `CustomFileViewerHmr` | 页面整页刷新，操作名同步变化 |
| `team.csv` | 将 `普通字段` 改为 `HMR 字段` | 页面整页刷新，第三行备注同步变化 |

验证结束后逐项恢复原文，尤其要把操作名恢复为 `CustomFileViewer`、单元格恢复为 `普通字段`，不要遗留临时 fixture 改动。

### 4. 检查生产构建与预览

运行：

```bash
pnpm build
```

预期命令成功结束，产物列表中存在名称类似 `dist/assets/CustomFileDemo-<hash>.js` 的按需页面 chunk；hash 会随构建内容变化。随后可以检查三种内容确实进入该 chunk：

```bash
grep -REo 'Markdown 已成为 Vue 组件|CustomFileViewer|林,晓' \
  dist/assets/CustomFileDemo-*.js
```

预期输出中能找到 `Markdown 已成为 Vue 组件`、`CustomFileViewer` 和 `林,晓`。再检查 Markdown 脚本哨兵没有以原始 HTML 标签进入产物：

```bash
if grep -R "<script>alert('不会执行')" dist/assets/CustomFileDemo-*.js; then
  echo '发现未转义 Markdown 脚本' >&2
  exit 1
else
  echo '未发现未转义的 Markdown 脚本标签'
fi
```

预期进入 `else`，输出“未发现未转义的 Markdown 脚本标签”；如果进入 `if`，命令以非零状态退出。

最后运行 `pnpm preview --port 4217 --strictPort`，打开 <http://localhost:4217/plugins/custom-files-demo>。预期页面结果与开发环境一致，但三种文件已经在构建时编入 chunk，不依赖开发服务器的转换接口或 Inspect。

## 进阶参考

::: details 生产级实现还需补齐

| 方向 | 教学实现边界 | 生产实现建议 |
| --- | --- | --- |
| Markdown AST | 逐行解析固定子集，不理解嵌套块、行内节点、链接与 HTML | AST（抽象语法树）是带结构的节点树；可使用 `remark` / `markdown-it` 等完整解析器生成目标代码，需要改写 SFC 脚本时再使用 SFC 解析器和 JavaScript AST |
| Markdown 安全 | 固定标签由插件生成，文本和 Vue 定界符转义 | 明确原始 HTML 策略，使用成熟的 sanitize 白名单；处理链接协议、图片、属性、指令和 SSR 上下文，不能把本示例当通用 sanitizer |
| GraphQL AST | 正则提取第一个操作名，不解析语法或 fragment | 使用 `graphql` parser / `graphql-tag`，处理多 operation、匿名 operation、fragment、schema 校验、类型生成或 persisted query |
| CSV parser | 单文件全量读入，固定逗号方言，严格报错，不自动跳过内部空行 | 选择成熟 CSV parser，补充编码、分隔符、空行、大文件流式处理、行列错误定位和大小限制；导出电子表格时还要考虑公式注入 |
| source map | `map: null`，没有原始文件到最终代码的完整映射 | 利用 AST 的位置信息和 `MagicString` / source-map 库生成并合并原始文件映射，在 dev 和 build 分别验证；本项目生产 `build.sourcemap` 默认关闭 |
| HMR | 三种文件统一整页刷新，不保留页面临时状态 | 根据 importer 和模块接受边界做精细失效；Markdown 组件需要与 Vue HMR 描述符和状态保留策略协作 |
| 输入边界 | 只处理仓库内受控 fixture | 不直接接收不可信上传；增加大小/深度限制、真实路径与符号链接检查、结构化错误和 schema 校验 |

这些不是“以后可优化的细节”，而是把受控教学 loader 推广到用户输入前必须重新设计的能力。

:::

::: details 常见坑

- **直接返回 `<template>`，却仍报“invalid JS”**：SFC 还需要 Vue 编译。本例通过合成 `.md.vue` ID 接入 `@vitejs/plugin-vue`，不是把 HTML 字符串当作最终浏览器模块。
- **不要随意给合成 Markdown ID 加 `\0`**：本例依赖 `.vue` 文件形态通过 Vue 插件过滤器，与使用 `\0` 的纯虚拟 JavaScript 模块是两种不同做法。
- **拦截 `?vue&type=template` 子模块**：这些请求属于 Vue 插件，本插件必须放行，否则主组件与模板子块会互相覆盖。
- **手写 `@/` 路径替换或在 `this.resolve` 中漏掉 `skipSelf`**：前者重复实现 alias，后者可能递归进入当前 `resolveId`；应复用 Vite 解析并遵守插件顺序。
- **直接 `curl file.csv` 得到源文本**：静态资源请求不等于模块转换请求；按模块验证时使用 `?import`。
- **只转义 `<`，双花括号仍被 Vue 编译**：进入 SFC 的文本还必须处理 <code v-pre>{{</code> 和 <code v-pre>}}</code>。
- **手写 JavaScript 字符串导致模块被引号或换行破坏**：使用 `JSON.stringify` 生成字面量，不要手工拼接源文本。
- **把类型声明当作运行时转换**：`.d.ts` 只提供类型信息；插件白名单、文件实际存在以及 Vite 模块转换仍然缺一不可。
- **看到 GraphQL 模块请求就误以为执行了 API 查询**：开发服务器加载模块与客户端向 GraphQL endpoint 查询数据是两个不同动作。
- **构建成功就认为 source map 完整**：`map: null` 明确说明本教学转换没有提供原始映射，开发响应中的后续映射也不等于完整原始映射。

:::
