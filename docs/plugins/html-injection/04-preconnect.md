# 13. 注入 preconnect 做性能优化

## 真实场景

页面如果必须从另一个 origin 获取关键字体、API 或静态资源，浏览器需要先完成 DNS、TCP，HTTPS 还涉及 TLS 握手。`<link rel="preconnect">` 可以提前建立连接，减少真正请求资源时的等待；`dns-prefetch` 是只预解析域名的较轻量回退。

本例只使用 `localhost` 和 `127.0.0.1` 的本地源，故意在配置中重复书写并混用尾斜杠，以验证归一化和去重。它不会连接真实 CDN 或任何外网服务。

## 核心钩子与数据流

```text
origin 配置数组（含重复值）
  → new URL(origin).origin 归一化协议、主机、端口并去掉路径
  → Map 按 origin 去重
  → preconnect link 描述符
  → 按 hostname 再次去重
  → dns-prefetch link 描述符（//hostname）
  → injectTo: 'head-prepend'，尽早交给浏览器
```

`URL.origin` 会把 `http://localhost:5173/` 和 `http://localhost:5173` 归为同一来源。Preconnect 必须保留端口，因为端口不同就是不同 origin；DNS 预取只关心 hostname，所以使用另一组 hostname 去重结果。

## 最小实现

源码位于 `plugins/html/preconnect.ts`：

```ts
function normalizeOrigins(origins: string[]): URL[] {
  const uniqueOrigins = new Map<string, URL>()

  for (const origin of origins) {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    uniqueOrigins.set(url.origin, url)
  }

  return [...uniqueOrigins.values()]
}
```

随后分别生成标签：

```ts
const preconnectTags = origins.map((url) => ({
  tag: 'link',
  attrs: {
    rel: 'preconnect',
    href: url.origin,
    crossorigin: true,
    'data-html-injection': 'preconnect',
  },
  injectTo: 'head-prepend',
}))

const dnsPrefetchTags = hostnames.map((hostname) => ({
  tag: 'link',
  attrs: {
    rel: 'dns-prefetch',
    href: `//${hostname}`,
    'data-html-injection': 'dns-prefetch',
  },
  injectTo: 'head-prepend',
}))
```

`crossorigin` 会影响预连接的凭据模式，真实项目必须与目标资源请求的 CORS/凭据方式一致，不能机械地给所有场景复制。

## 配置接入

`plugins/html/index.ts` 追加 `preconnect()`：

```ts
import { preconnect } from './preconnect.ts'

export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts(), injectHeadAssets(), mpaEntry(), preconnect()]
}
```

也可以传入 `preconnect({ origins: [...] })`。默认端口与主应用的 `server.port` 一致，固定为 `5173`，不读取 worktree 或临时验证端口；使用其他端口或真实跨域源时应显式传入 `origins`。默认数组有四个字符串，但只对应两个唯一本地 origin，因此最终应有两个 preconnect 和两个 dns-prefetch，而不是八个标签。

## 验证步骤

1. 启动 `pnpm exec vite --port 5173`，打开 `http://localhost:5173/plugins/html-injection` 的“本地 preconnect / dns-prefetch”面板。
2. 页面应列出四个实际 link：`http://localhost:5173` 与 `http://127.0.0.1:5173` 的 preconnect，以及 `//localhost` 与 `//127.0.0.1` 的 dns-prefetch。检查 preconnect 的 `crossorigin` 属性。
3. 请求 `curl http://localhost:5173/`，确认标签位于 `<head>` 前部、每种 rel/href 组合唯一，并排在模块脚本之前。
4. 执行 `pnpm build`，分别检查 `dist/index.html` 和 `dist/admin.html`；两个 MPA 入口都应各有一组唯一 link，且没有路径残留或重复尾斜杠变体。
5. 执行 `pnpm docs:build` 与 `git diff --check`。

## 生产级实现还需补齐

- 只保留真实、关键、跨域且会提前知道的源；从网络瀑布和 Web Vitals 数据证明收益，而不是把域名清单全部注入。
- 根据资源请求模式选择是否带 `crossorigin`，并保证 preconnect 与实际请求的凭据模式匹配，否则连接可能无法复用。
- 在部署 base、CDN 域名或多环境变化时生成正确 origin；不要把本例的教学 localhost 配置原样发布。
- 用真实 RUM/Lighthouse 对比验证 LCP、请求阻塞时间和连接复用，同时关注移动网络与连接池开销。

## 常见坑

- **preconnect 不能替代资源加载**：它只提前建立连接，不会下载 JS、CSS、字体或 API 数据；需要预加载关键资源时评估 `<link rel="preload">`，两者用途不同。
- 对同源资源或无关键请求的第三方源预连接，浪费套接字、DNS、TLS 和内存，可能反而拖慢关键连接。
- 只按完整字符串去重，漏掉尾斜杠、默认端口等等价 origin。
- 给 preconnect 配置了路径并期待浏览器按路径建连；连接复用以 origin 为边界，而非 URL 路径。
- 注入很多 preconnect，却没有测量收益；浏览器无法无限复用这些提前连接。

更多 HTML 钩子背景见 [ch10 插件机制](../../guide/ch10-plugins.md)。
