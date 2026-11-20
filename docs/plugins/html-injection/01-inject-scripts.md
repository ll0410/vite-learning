# 10. 注入 CDN、监控脚本与统计代码

## 真实场景

应用有时需要在业务入口之前加载 CDN  SDK、错误监控初始化脚本或访问统计脚本。与直接修改每个 HTML 文件相比，Vite 插件可以从一份配置生成标签，保证开发环境与生产构建使用同一套顺序和属性。

本例注入三个 **本地 stub**：CDN、监控和统计脚本只记录自己的加载标记与执行顺序，不请求任何外部服务。

## 核心钩子与数据流

`transformIndexHtml` 在 Vite 输出 HTML 前收到原始字符串，可以返回新的 `html` 和 `tags`：

```text
脚本配置数组
  → 按数组顺序 map 为 HtmlTagDescriptor[]
  → transformIndexHtml 返回 tags
  → Vite 把标签放到 head
  → 浏览器同步下载并依次执行 public/ 中的本地文件
  → window.__pluginLabHtml 记录 loaded 与 order
```

描述符中的 `injectTo: 'head'` 让标签进入 `<head>`。这里没有设置 `async` 或 `defer`，所以三个很小的同步脚本按标签顺序执行，并且在模块入口运行前完成。

## 最小实现

源码位于仓库根目录的 `plugins/html/inject-scripts.ts`。

```ts
export function injectScripts(options: InjectScriptsOptions = {}): Plugin {
  const scripts = options.scripts ?? localScripts

  return {
    name: 'plugin-lab:inject-scripts',
    transformIndexHtml(html) {
      return {
        html,
        tags: scripts.map((script) => ({
          tag: 'script',
          attrs: {
            src: script.src,
            'data-html-injection': script.purpose,
          },
          injectTo: 'head',
        })),
      }
    },
  }
}
```

返回描述符比在字符串中查找 `</head>` 再拼接更可靠：Vite 负责最终插入位置，也能继续让其他 HTML 插件处理这些标签。

## 配置接入

`plugins/html/index.ts` 在本分类插件数组中注册插件，共享 `vite.config.ts` 不需要修改：

```ts
import { injectScripts } from './inject-scripts.ts'

export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts()]
}
```

默认配置依次是 `cdn → monitor → analytics`。需要调整顺序时，向 `scripts` 传入新的数组即可；数组本身决定了标签和执行顺序。三个 URL 都指向 `public/plugin-lab/`，Vite 会原样提供并复制到构建产物。

## 验证步骤

1. 启动开发服务：`pnpm exec vite --port 5214`。
2. 打开 `http://localhost:5214/plugins/html-injection`，在“本地 CDN、监控与统计脚本”面板确认三个加载标记均为“已加载”，顺序为 `cdn、monitor、analytics`，并核对页面列出的三个实际标签。
3. 请求开发 HTML：`curl http://localhost:5214/`，确认 `head` 中三类 `script[data-html-injection]` 各出现一次且顺序正确。
4. 执行 `pnpm build`，检查 `dist/index.html` 仍有相同标签，并确认 `dist/plugin-lab/` 下存在三个 stub。
5. 执行 `pnpm docs:build` 与 `git diff --check`，确认文档和工作区格式正常。

也可在浏览器控制台读取：

```js
window.__pluginLabHtml
// { order: ['cdn', 'monitor', 'analytics'], loaded: { cdn: true, monitor: true, analytics: true } }
```

## 生产级实现还需补齐

- **Sentry 等监控 SDK**：通常要先加载 SDK，再以明确的 DSN、release、environment 和采样率初始化；需处理加载失败、隐私过滤、sourcemap 上传与敏感数据脱敏，不能把本例的布尔标记当成监控初始化。
- **统计脚本**：很多统计 SDK 要求 `async`，加载顺序不再等价于执行顺序；还要考虑同意管理、去重、SPA 路由埋点、广告拦截及失败降级。
- **真实 CDN**：应明确跨域、超时、本地回退、版本锁定与 SRI；`public/` 文件不会被 Vite 打包 hash，也不能通过 import 获得模块依赖图能力。
- **环境差异**：按 `configResolved` 的 mode 或公开环境配置决定是否启用，避免开发流量写入正式统计。

## 常见坑

- 给所有脚本同时加 `async`，却仍断言它们按配置顺序执行。
- 在多个插件或 HTML 中重复注入同一 SDK，造成重复初始化和重复统计。
- 把密钥写进公开脚本配置；浏览器中的 DSN、公开写 key 等仍应视为可公开信息，并限制权限。
- 直接请求第三方 URL 作为教学测试，导致结果受网络、隐私策略和外部服务可用性影响。

继续回顾 [ch10 插件机制](../../guide/ch10-plugins.md) 中 HTML 转换钩子的基础用法。
