# 12. MPA 按入口注入不同标签

MPA（Multi-Page Application，多页应用）是指一个项目包含多个 HTML 页面，每个页面有自己的 JavaScript 入口；页面之间跳转时，浏览器通常会加载一份新的文档。它与 SPA（Single-Page Application，单页应用）不同：SPA 通常只有一份 HTML，再由前端路由切换页面内容。

本例同时保留两种形态：主站仍是由 Vue Router 驱动的 SPA，Admin 则是一份独立的轻量 HTML。`mpaEntry()` 插件负责两件互补的事：

- **build 时登记两个 HTML 入口**，让 `index.html` 和 `admin.html` 都进入生产产物。
- **dev 和 build 时分别转换 HTML**，移除模板里的旧标题，再注入当前入口专属的 `meta` 和 `title`。

前者解决“构建哪些页面”，后者解决“每份 HTML 里写什么标签”，不能互相替代。

::: tip 现成方案速览
- **官方 / 成熟方案**：Vite 官方 [多页应用](https://vite.dev/guide/build.html#multi-page-app)：用 `build.rolldownOptions.input` 声明多个 HTML，每个入口维护自己的模板，再用 `transformIndexHtml` 按入口上下文分流。
- **覆盖程度**：**官方已覆盖**。
- **本例定位**：教学用最小实现，重点是理解两个互补链路：构建入口声明，以及 dev/build 的按入口标签注入。
- **值得自研的时机**：入口映射非常复杂、需要统一模板和共享注入规则时。
:::

## 先看完整结果：两个入口各得到什么

插件中的入口元数据、构建入口名和页面消费方式如下。注意：**构建入口名是 `index/admin`，注入到 meta 中的标识是 `main/admin`**，它们不是同一组值。

| 对照项 | 主入口 | Admin 入口 |
| --- | --- | --- |
| 源 HTML | `index.html` | `admin.html` |
| `build.rolldownOptions.input` 的键 | `index` | `admin` |
| 模板原始标题 | `Vite 一天动手实验室` | `Admin HTML 原始标题` |
| JavaScript 入口 | `/src/main.ts` | `/src/mpa/admin.ts` |
| `meta[name="plugin-lab-entry"]` 的 `content` | `main` | `admin` |
| 注入后的标题 | `Vite 插件实验室 · Main SPA` | `Vite 插件实验室 · Admin` |
| 页面消费方式 | 启动 Vue、安装主 Router，演示组件读取 meta 和标题 | 保留静态 Admin 内容，入口脚本读取 meta 和标题，不启动主 Router |

只关注本例注入的标签，两个 HTML 的最终结果分别是：

```html
<!-- index.html：其他 head 内容与其他插件注入的标签省略 -->
<meta name="plugin-lab-entry" content="main" data-html-injection="entry-meta">
<title data-html-injection="entry-title" data-entry="main">Vite 插件实验室 · Main SPA</title>
```

```html
<!-- admin.html：其他 head 内容与其他插件注入的标签省略 -->
<meta name="plugin-lab-entry" content="admin" data-html-injection="entry-meta">
<title data-html-injection="entry-title" data-entry="admin">Vite 插件实验室 · Admin</title>
```

这些结果能在页面上直接观察到：

- 主 SPA 的 `/plugins/html-injection#mpa-entry` 面板显示“当前主 SPA 标识：**main**”和“当前标题：`Vite 插件实验室 · Main SPA`”，并提供“打开 /admin.html 对比 Admin 入口”的链接。
- `/admin.html` 显示静态标题“Admin MPA 入口”，以及“这是独立的 admin.html，不会启动主 SPA 的 Vue Router。”；脚本执行后，“入口标识”变为 **admin**，“注入标题”变为 `Vite 插件实验室 · Admin`。

下面从构建产物反推两个钩子，再看标签如何被页面代码消费。

## 两条互补链路

```text
链路一：只在 build 时登记入口
config(command = build)
  → 返回 build.rolldownOptions.input.{index, admin}
  → 与根 vite.config.ts 深合并
  → index.html、admin.html 都作为构建输入
  → 产出 dist/index.html、dist/admin.html

链路二：dev 与 build 都会转换每份 HTML
transformIndexHtml(html, context)
  → basename(context.filename) 选择 index/admin 元数据
  → 移除模板中的简单旧 title
  → 返回入口专属 meta + title 描述符
  → Vite 将新标签注入 head
  → Main SPA 或 Admin 入口脚本读取并使用结果
```

如果没有链路一，dev 里能打开的 `admin.html` 仍可能完全没有进入生产构建；如果没有链路二，即使两个 HTML 都被构建，也只会保留各自的原始标题，不会得到这里的入口 meta 和新标题。

## 链路一：build 时把两个 HTML 声明为 input

完整实现位于 `plugins/html/mpa-entry.ts`。下面只节选 `config` 钩子：

```ts
config(_config, { command }) {
  if (command !== 'build') return

  return {
    build: {
      rolldownOptions: {
        input: {
          index: fileURLToPath(new URL('../../index.html', import.meta.url)),
          admin: fileURLToPath(new URL('../../admin.html', import.meta.url)),
        },
      },
    },
  }
}
```

`input` 对象的键 `index`、`admin` 是两个构建入口的名称，值则是 HTML 的绝对路径。这里用 `import.meta.url` 定位插件文件附近的 `../../index.html` 和 `../../admin.html`，避免路径解析依赖启动命令时所在的目录。项目当前使用 Vite 8，因此配置写在 `rolldownOptions` 下。

### 返回局部配置，为什么不会覆盖根配置

`config` 钩子返回的是**待合并的配置片段**。这里的“深合并”可以通俗理解为：Vite 沿着 `build → rolldownOptions` 等嵌套层级合并字段，而不是用插件返回的整个 `build` 对象替换原配置。

根 `vite.config.ts` 已经配置了：

```text
build.rolldownOptions.output.codeSplitting.groups
  ├─ vendor-vue
  └─ vendor-utils
```

插件补入的是同级的 `build.rolldownOptions.input`。因此在这个项目中，`input` 与原有的 `output.codeSplitting` 会同时保留，不需要把根配置复制进插件。

### 为什么 dev 可以直接访问，build 却必须声明

dev server 按浏览器请求按需处理磁盘上的文件。请求 `/admin.html` 时，它能找到根目录下的 `admin.html`，再处理其中的 `/src/mpa/admin.ts`，所以不登记构建 input 也能打开页面。

生产构建则是从声明的入口出发收集依赖并写出产物。构建器不会因为某个文件在 dev 中可访问，就自动把所有 HTML 都当作入口；如果 `admin.html` 不在 `input` 中，就不能指望它出现在 `dist` 中。这正是 `config` 只在 `command === 'build'` 时返回配置的原因。

## 链路二：dev/build 按当前 HTML 注入不同标签

同一份 HTML 转换逻辑会在 dev 和 build 中执行。插件先定义两个入口的固定元数据：

```ts
const entryAssets = {
  index: {
    label: 'main',
    title: 'Vite 插件实验室 · Main SPA',
  },
  admin: {
    label: 'admin',
    title: 'Vite 插件实验室 · Admin',
  },
} as const
```

下面是 `mpaEntry()` 中的完整 `transformIndexHtml` 钩子；插件的 `name` 和 `config` 字段不在本段重复：

```ts
transformIndexHtml(html, context): { html: string; tags: HtmlTagDescriptor[] } {
  const entryName = basename(context.filename) === 'admin.html' ? 'admin' : 'index'
  const entry = entryAssets[entryName]

  return {
    html: html.replace(/\s*<title>[^<]*<\/title>/, ''),
    tags: [
      {
        tag: 'meta',
        attrs: {
          name: 'plugin-lab-entry',
          content: entry.label,
          'data-html-injection': 'entry-meta',
        },
        injectTo: 'head',
      },
      {
        tag: 'title',
        attrs: {
          'data-html-injection': 'entry-title',
          'data-entry': entry.label,
        },
        children: entry.title,
        injectTo: 'head',
      },
    ],
  }
}
```

这里同时返回两部分：

- `html`：对原 HTML 字符串做一次替换，删除简单的旧 `<title>`。两份模板都已有标题，如果直接追加新标题而不删除旧标题，同一文档就会出现两个 `title`。
- `tags`：用 `HtmlTagDescriptor`（HTML 标签描述符）声明要注入的 `meta` 和 `title`。`injectTo: 'head'` 指定插入头部，`attrs` 对应元素属性，`children` 对应标题文本。

于是，`index.html` 的“Vite 一天动手实验室”和 `admin.html` 的“Admin HTML 原始标题”都被替换，最终各自只保留前面结果表中的新标题。

### 为什么使用 context.filename，而不是 originalUrl 或 query

`context.filename` 表示**当前正在转换的 HTML 文件路径**。无论这份 HTML 是在 dev 中响应请求，还是在 build 中作为入口处理，都可以根据它的文件名选择元数据。本例再用 `basename()` 取路径最后一段，只判断是不是 `admin.html`。

`originalUrl` 描述的是 dev 请求的原始 URL，而构建 HTML 时没有一次等价的浏览器请求，不能用它识别构建入口。query 也不适合做这个判断：

```text
/admin.html?from=nav
```

query 是请求时附加的信息，同一份构建后的 `admin.html` 未来可能对应很多不同 query。build 发生在此之前，无法根据将来的请求 query 决定当前该生成哪份 HTML。相反，无论 dev 请求是否带 query，正在处理的源文件仍然是 `admin.html`，所以应使用 `context.filename`。

## 标签注入之后：Main 与 Admin 分别消费

### Main：仍是一条完整的 Vue SPA 启动链

`index.html` 保留 `/src/main.ts` 和 `#app` 挂载点。`src/main.ts` 中的启动代码是：

```ts
const app = createApp(App)
app.use(router)
setupPluginLab(app)
app.mount('#app')
```

主 Router 在 `src/plugin-lab/routes/html-injection.ts` 中注册了下面的记录：

```ts
{
  path: '/plugins/html-injection',
  name: 'plugin-lab-html-injection',
  component: () => import('@/views/plugins/categories/HtmlInjectionDemos.vue'),
}
```

该演示组件在模块初始化时读取插件注入的结果：

```ts
const mainEntry = document.querySelector<HTMLMetaElement>('meta[name="plugin-lab-entry"]')?.content ?? ''
const mainEntryTitle = document.title
```

模板再把 `mainEntry` 和 `mainEntryTitle` 显示在 `mpa-entry` 面板中。因此，页面上看到的 `main` 和 Main SPA 标题不是组件里另写的一份常量，而是当前文档 head 中的实际值。

### Admin：独立文档只做轻量读取

`admin.html` 没有 `#app`，也不加载 `/src/main.ts`。它的静态正文已经包含：

```html
<main id="admin-app">
  <h1>Admin MPA 入口</h1>
  <p>这是独立的 admin.html，不会启动主 SPA 的 Vue Router。</p>
  <p>入口标识：<strong id="entry-name">读取中</strong></p>
  <p>注入标题：<code id="entry-title">读取中</code></p>
  <p><a href="/plugins/html-injection">返回主 SPA 的 HTML 注入实验</a></p>
</main>
<script type="module" src="/src/mpa/admin.ts"></script>
```

`/src/mpa/admin.ts` 的完整逻辑只是读取 meta、记录到 `body.dataset.entry`，并更新两处文本：

```ts
const entry = document.querySelector<HTMLMetaElement>('meta[name="plugin-lab-entry"]')?.content ?? 'unknown'

document.body.dataset.entry = entry

const entryName = document.getElementById('entry-name')
const entryTitle = document.getElementById('entry-title')

if (entryName) entryName.textContent = entry
if (entryTitle) entryTitle.textContent = document.title
```

这里没有 `createApp`，没有导入或安装 Router，也没有创建 Admin 专用 Router。它是一个直接加载新文档的 MPA 入口，而不是主 SPA 中新增的 `/admin` 路由。这样可以减少 Admin 示例的启动依赖，同时清楚展示“HTML 注入”和“前端路由”是两套不同机制。

## 配置接入

`plugins/html/index.ts` 将 `mpaEntry()` 加入 HTML 注入插件数组，import 语句此处省略：

```ts
export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts(), injectHeadAssets(), mpaEntry(), preconnect()]
}
```

根 `vite.config.ts` 再展开这一组插件：

```ts
plugins: [
  // 其他插件省略
  ...htmlInjectionPlugins(),
  // 其他插件省略
],
```

数组顺序也是这些插件 `transformIndexHtml` 钩子的默认执行顺序：前一个插件返回的 `html` 会交给后一个插件，各插件声明的 `tags` 则由 Vite 汇总并注入。本例的两个入口模板仍然只写各自的 `/src/...` 模块脚本；生产构建时，Vite 会把它们改写为构建资源 URL。

## 验证步骤

下面给出检查方法和可观察预期，需要自行运行对应命令。

### 1. dev：比较两个文档和页面结果

运行：

```bash
pnpm exec vite --port 5214
```

访问 `http://localhost:5214/plugins/html-injection#mpa-entry`。

预期结果：MPA 面板显示主 SPA 标识 `main`、标题 `Vite 插件实验室 · Main SPA`；点击“打开 /admin.html 对比 Admin 入口”会打开新的 Admin 文档。

访问 `http://localhost:5214/admin.html`。

预期结果：页面显示“Admin MPA 入口”和“这是独立的 admin.html，不会启动主 SPA 的 Vue Router。”；两处“读取中”分别变为 `admin` 与 `Vite 插件实验室 · Admin`。页面还保留“返回主 SPA 的 HTML 注入实验”链接，没有出现主 SPA 的 Router 页面。

也可以直接比较 dev 返回的 HTML：

```bash
curl http://localhost:5214/
curl http://localhost:5214/admin.html
```

预期结果：两份 HTML 的旧标题都消失，各自只有一个本例注入的新 `title`；`meta[name="plugin-lab-entry"]` 的 `content` 分别为 `main` 和 `admin`，并带有源码中的 `data-html-injection` 属性。dev 中的模块脚本仍分别指向 `/src/main.ts` 与 `/src/mpa/admin.ts`。

### 2. build：检查两个 HTML 都进入产物

运行：

```bash
pnpm build
```

预期结果：`dist/index.html` 和 `dist/admin.html` 都存在；两份产物分别保留 Main/Admin 的新标题、入口 meta 及其标识属性，原始标题不再出现。默认 `base` 为 `/` 时，两个 HTML 的入口脚本应指向 `/assets/` 下的构建文件，而不是 `/src/`。

如需检查产物运行结果，可继续启动预览服务：

```bash
pnpm exec vite preview --port 5314
```

在默认根路径部署下，访问 `http://localhost:5314/plugins/html-injection#mpa-entry` 和 `http://localhost:5314/admin.html`，预期看到与 dev 相同的入口标识、标题和 Admin 静态文案。此时加载的应是构建后的资源。

## 进阶参考

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 未知入口会静默回退，title 替换也只覆盖简单模板

当前判断只有 `basename(context.filename) === 'admin.html'` 一个分支：其他文件名全部进入 `index` 分支。新增一个未知 HTML 时不会报错，而会静默注入 `main` 标识和 Main SPA 标题；不同目录下只要文件名是 `admin.html`，也会命中 Admin 分支。这对当前两个受控模板足够，但通用插件应显式维护文件到入口的映射，并为不支持的入口提供诊断。

旧标题通过 `/\s*<title>[^<]*<\/title>/` 删除。它只适合本项目这种小写、无属性、内部没有 `<` 的简单标题，而且只替换第一个匹配项；它不是通用 HTML parser。若模板可能出现属性、大小写变化或更复杂结构，应使用真正的 HTML parser，或者严格限定模板格式并添加源 HTML 断言，避免删除失败后继续注入第二个标题。

:::

::: details 非根 base、公共 chunk 和资源策略需要单独检查

根配置的 `base` 在 `GITHUB_PAGES === 'true'` 时为 `/vite-learning/`，否则为 `/`。当前演示组件中的 `/admin.html` 链接和 Admin 页中的 `/plugins/html-injection` 返回链接都是根绝对路径，不应假设它们会自动适配任意非根部署。部署到子路径时，需要检查并按部署 base 调整这些链接，同时核对构建后的 script、公共样式和其他资源 URL。

多入口也不等于每个入口都完全独立复制所有依赖。入口之间共享的模块可能被拆成公共 chunk，也可能因依赖图和拆分策略不同而没有共享；根配置的 `vendor-vue`、`vendor-utils` 分组则会因配置深合并而保留。应依据实际产物检查公共 chunk、入口私有资源、缓存和加载性能，不要预设每个入口都会加载同一个 vendor 文件。

:::

::: details 独立 Admin 入口不构成鉴权边界

`/admin.html` 可以直接被请求，`meta` 中的 `admin` 也只是展示用的入口标识。独立 HTML、不启用主 Vue Router、隐藏导航入口都不能阻止未授权访问。真实 Admin 的页面与数据权限必须由服务端和实际鉴权流程保证，前端入口只负责代码组织与页面展示。

:::

插件钩子基础可继续回顾 [ch10 插件机制](../../guide/ch10-plugins.md)，对照配置钩子与 HTML 转换钩子的执行时机。
