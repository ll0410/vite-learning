# 16. 调试接口：查看运行时配置、清缓存

## 白名单配置

`plugins/dev-server/debug-endpoints.ts` 注册 `GET /api/lab/debug/config`，只逐项构造以下响应：

- `mode`：当前 Vite mode。
- `pluginNames`：已解析插件的名称。
- `server.port`：优先取 `httpServer.address()` 的实际监听端口。
- `server.strictPort`：是否严格要求指定端口。

不要直接序列化 `server.config`、`process.env` 或 `import.meta.env`：其中可能包含环境变量、路径、鉴权配置或其他秘密。本例的响应对象不读取这些字段，也不返回 Cookie、请求头或环境变量。

## 清缓存与页面刷新

`POST /api/lab/debug/clear-cache` 统计当前模块数，调用 `server.moduleGraph.invalidateAll()`，返回失效模块数，再通过 `server.ws.send({ type: 'full-reload', path: '*' })` 通知浏览器刷新。模块失效后，后续请求会重新执行转换，而不是复用旧的转换结果。

两个端点都有方法限制：配置接口只接受 `GET`，清缓存只接受 `POST`；错误方法返回 `405` 和对应的 `Allow` 响应头。插件声明 `apply: 'serve'`，生产构建不注册调试接口。

## 页面与 HTTP 验证

```bash
pnpm exec vite --port 5215
```

打开 <http://localhost:5215/plugins/dev-server/debug-endpoints-demo>。点击“查看安全运行配置”检查 mode 和插件名；点击“清缓存并刷新”，观察请求结果和页面 full-reload。

```bash
curl -s http://localhost:5215/api/lab/debug/config
curl -i -X POST http://localhost:5215/api/lab/debug/clear-cache
curl -i -X POST http://localhost:5215/api/lab/debug/config
curl -i http://localhost:5215/api/lab/debug/clear-cache
```

预期前两个请求为 `200`，后两个为 `405`。清缓存响应形如：

```json
{
  "invalidatedModules": 20,
  "fullReload": true
}
```

模块数取决于当前已加载页面，不要求固定。响应中不应出现任何 `env`、Cookie 或秘密字段。

调试端点会暴露工程结构并主动刷新所有客户端，只适用于受控本地开发环境。生产环境不要注册；如需远程诊断，必须另外实现鉴权、授权、审计和访问范围限制。

```bash
pnpm build
pnpm docs:build
git diff --check
```

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
