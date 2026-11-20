# 15. 本地代理特殊逻辑与接口转发兜底

## 数据流

`plugins/dev-server/proxy-fallback.ts` 同时提供本地主接口和面向页面的转发接口：

- `GET /api/lab/proxy/resource?mode=success`：主接口返回 `200`，来源为 `primary`。
- `GET /api/lab/proxy/resource?mode=http-error`：主接口确定性返回 `503`，转发中间件改返带 `reason: http-503` 的 `fallback` 数据。
- `GET /api/lab/proxy/resource?mode=network-error`：主接口主动断开本次 socket，转发中间件捕获网络异常并返回 `reason: network-error` 的 `fallback` 数据。

转发 URL 通过 `server.httpServer.address()` 取得**当前实际监听端口**，不写死 `5173` 或 `5215`。所有请求都只在本地开发服务器内完成，不访问外部服务。插件使用 `apply: 'serve'`，构建期不会注册这些接口。

## 页面与 HTTP 验证

```bash
pnpm exec vite --port 5215
```

打开 <http://localhost:5215/plugins/dev-server/proxy-fallback-demo>，依次点击“主接口成功”“模拟主接口失败”和“模拟网络错误”，观察来源与原因字段。

```bash
curl -s 'http://localhost:5215/api/lab/proxy/resource?mode=success'
# {"source":"primary","message":"本地主接口成功"}

curl -s 'http://localhost:5215/api/lab/proxy/resource?mode=http-error'
# {"source":"fallback","reason":"http-503","message":"主接口返回非 2xx，已使用本地兜底数据"}

curl -s 'http://localhost:5215/api/lab/proxy/resource?mode=network-error'
# {"source":"fallback","reason":"network-error","message":"主接口网络错误，已使用本地兜底数据"}
```

兜底响应使用 `200` 是为了让示例调用方能直接渲染替代数据，并通过 `source` 明确标记来源；真实项目也可以按业务约定返回 `502/503`，不应把兜底误认为主接口成功监控信号。

## 与生产代理的差距

本例只演示 `configureServer`、运行时地址和错误分支。转发真实远程服务时，还必须处理连接与响应超时、取消请求、Header 白名单、Cookie/鉴权、重定向、响应大小、协议与证书、重试幂等性以及监控日志；不能把任意客户端 Header 原样转发，也不能让 fallback 悄悄隐藏长期故障。

```bash
pnpm build
pnpm docs:build
git diff --check
```

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
