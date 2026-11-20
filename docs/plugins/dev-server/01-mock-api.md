# 14. Mock API

## 目标与边界

本例复用 `plugins/mock-api.ts`，在 `configureServer` 中把 `/api/mock/users` 挂到 Vite 的 Connect 中间件链。插件声明 `apply: 'serve'`，因此只有开发服务器会注册接口，`vite build` 不执行这段中间件逻辑。

接口保留三个固定用户，并显式设置 `Content-Type: application/json; charset=utf-8`，让浏览器和 `fetch().json()` 按 JSON 正确处理响应。

这是用于讲解 Vite 钩子的最小服务端 Mock。MSW 则主要拦截浏览器或测试进程中的请求，可模拟网络层行为并复用到测试；需要完整 Mock 数据平台、按需切换场景或跨进程复用时，应选择合适的专用方案，而不是无限扩展本插件。

## 页面验证

```bash
pnpm exec vite --port 5215
```

打开 <http://localhost:5215/plugins/dev-server/mock-api>，点击“加载三个用户”，页面应显示 Alice、Bob、Carol。Home 的“请求 mock 接口”仍使用同一个接口，可直接回归 <http://localhost:5215/>。

也可以请求原始 JSON：

```bash
curl -i http://localhost:5215/api/mock/users
```

预期状态为 `200`，响应头包含 JSON Content-Type，正文为：

```json
{
  "total": 3,
  "users": [
    { "id": 1, "name": "Alice", "role": "frontend" },
    { "id": 2, "name": "Bob", "role": "backend" },
    { "id": 3, "name": "Carol", "role": "designer" }
  ]
}
```

## 构建验证

```bash
pnpm build
pnpm docs:build
git diff --check
```

构建成功且不会出现开发接口的监听行为。中间件只存在于 dev server，不是生产 API，也不会被打进浏览器产物。

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
