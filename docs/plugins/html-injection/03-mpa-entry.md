# 12. MPA 按入口注入不同标签

## 真实场景

多页应用（MPA）中，主站、管理后台和活动页可能共享构建工具，却需要不同的标题、meta、监控维度或资源提示。插件可以识别当前 HTML entry，再注入该入口专属标签；同时通过配置钩子声明所有构建入口，避免手工维护另一份构建配置。

本例保留主 `index.html` SPA，新增独立 `admin.html` 与 `src/mpa/admin.ts`。Admin 不启动 Vue Router，只读取注入的 meta 并展示当前入口和标题。

## 核心钩子与数据流

本插件使用两个钩子：

```text
config(command = build)
  → 返回 build.rolldownOptions.input.{index, admin}
  → Vite 与共享配置深合并
  → 构建 dist/index.html 与 dist/admin.html

transformIndexHtml(html, context)
  → basename(context.filename) 判断 index / admin
  → 移除原 HTML 的简单 title
  → 返回入口专属 meta + title 描述符
```

`ctx.filename` 指向正在处理的 HTML 文件，开发和构建都能使用。不要只依赖 dev 的 `originalUrl`，因为构建阶段没有等价的浏览器请求 URL。

## 最小实现

源码位于 `plugins/html/mpa-entry.ts`。构建入口通过 `config` 返回部分配置：

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

这里使用项目当前 Vite 8 的 `rolldownOptions`。Vite 会把返回值合并进已有配置，所以共享 `vite.config.ts` 中的 `output.codeSplitting` 等设置仍然有效，无需在本插件中复制。

HTML 转换根据文件名选择固定资源：

```ts
const entryName = basename(context.filename) === 'admin.html' ? 'admin' : 'index'
const entry = entryAssets[entryName]

return {
  html: html.replace(/\s*<title>[^<]*<\/title>/, ''),
  tags: [
    { tag: 'meta', attrs: { name: 'plugin-lab-entry', content: entry.label } },
    { tag: 'title', children: entry.title },
  ],
}
```

原 HTML 中已有 `<title>`，所以先移除再注入，避免一个文档保留两个标题。这里的正则只匹配本项目无嵌套的简单标题，不是通用 HTML parser。

## 配置接入

`plugins/html/index.ts` 追加 `mpaEntry()`，共享配置保持不变：

```ts
import { mpaEntry } from './mpa-entry.ts'

export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts(), injectHeadAssets(), mpaEntry()]
}
```

`admin.html` 通过 `/src/mpa/admin.ts` 启动自己的轻量入口；开发服务器可直接访问 `/admin.html`，构建时则由上面的 `input` 明确纳入产物。

## 验证步骤

1. 启动 `pnpm exec vite --port 5214`。
2. 打开 `http://localhost:5214/plugins/html-injection`，在 MPA 面板确认主入口标识为 `main`、标题为 `Vite 插件实验室 · Main SPA`，并确认头部“插件”导航仍在。
3. 点击打开 `http://localhost:5214/admin.html`，确认标识变为 `admin`、标题为 `Vite 插件实验室 · Admin`，页面展示 Admin 自有内容且没有主 SPA 路由。
4. 分别请求 `curl http://localhost:5214/` 与 `curl http://localhost:5214/admin.html`，确认二者只有一个注入后的 title，meta 值不同。
5. 执行 `pnpm build`，确认 `dist/index.html` 和 `dist/admin.html` 均存在；两个文件的入口 JS 都应指向 `/assets/` 下的构建文件，而不是 `/src/`。
6. 执行 `pnpm docs:build` 和 `git diff --check`。

## 生产级实现还需补齐

- 将入口元数据抽成受控配置，校验不支持的 HTML 文件，避免所有未知页面都静默套用主入口。
- 使用 `configResolved` 取得 `root` 和 `base`，验证非根部署、反向代理和嵌套 MPA 目录下的 HTML 与资源 URL。
- 明确共享 chunk、公共样式和各入口私有资源策略，检查缓存与加载性能。
- Admin 的权限必须由服务端和真实鉴权流程保证；单独的 HTML 或前端入口标识不构成安全边界。
- 若需要任意 HTML 改写，使用真正的 parser；保留最小字符串替换时，应限定模板格式并添加源 HTML 断言。

## 常见坑

- 只在 dev 打开 admin 页面，却忘记声明 build input，导致生产产物缺失。
- 在插件返回完整 `build` 配置而覆盖已有配置，而不是返回可深合并的局部字段。
- 直接追加 title 却不移除原 title，造成重复标签和浏览器标题不确定。
- 通过 URL query 判断构建入口；构建期没有这次运行时请求。
- 把主 SPA 的 history fallback 当成 Admin 鉴权或页面渲染机制。

继续回顾 [ch10 插件机制](../../guide/ch10-plugins.md) 的配置钩子与 HTML 钩子执行方式。
