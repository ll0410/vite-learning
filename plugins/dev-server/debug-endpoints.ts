// 插件示例：提供开发期运行时配置查询和模块缓存清理接口。
// 学习点：configureServer 可读取 ViteDevServer，并通过 moduleGraph/WebSocket 主动刷新页面。
import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/** 发送不缓存的 JSON 响应；调用 res.end 后不再执行 next，避免重复处理同一请求。 */
function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * 创建开发调试接口：GET /config 查看运行时状态，POST /clear-cache 清理模块缓存并刷新页面。
 * apply: 'serve' 确保这些能力只存在于开发服务器，不参与生产构建。
 */
export function debugEndpointsPlugin(): Plugin {
  return {
    name: 'lab:debug-endpoints',
    apply: 'serve',

    // configureServer 可拿到完整的 ViteDevServer，并在 Vite 内部中间件之前注册自定义接口。
    configureServer(server) {
      // 外部请求带 /api/lab/debug 前缀；进入挂载处理器后 req.url 只剩 /config 等子路径。
      server.middlewares.use('/api/lab/debug', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        // 这里读取的是解析后的 Vite 配置与实际监听地址，不是 vite.config 文件的原始文本。
        if (url.pathname === '/config') {
          if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET')
            sendJson(res, 405, { error: 'method_not_allowed' })
            return
          }

          const address = server.httpServer?.address()
          sendJson(res, 200, {
            mode: server.config.mode,
            pluginNames: server.config.plugins.map((plugin) => plugin.name),
            server: {
              port:
                address && typeof address !== 'string'
                  ? address.port
                  : server.config.server.port,
              strictPort: server.config.server.strictPort,
            },
          })
          return
        }

        // 模块图记录模块及其转换缓存；invalidateAll 只清服务端状态，不会自动重置浏览器已执行的模块。
        if (url.pathname === '/clear-cache') {
          if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST')
            sendJson(res, 405, { error: 'method_not_allowed' })
            return
          }

          // 失效模块图后还需整页刷新，浏览器才会重新请求并执行最新模块。
          const invalidatedModules = server.moduleGraph.idToModuleMap.size
          server.moduleGraph.invalidateAll()
          sendJson(res, 200, { invalidatedModules, fullReload: true })
          // 通过 Vite 的 HMR WebSocket 通知客户端整页刷新；刷新后的请求会触发模块重新转换。
          server.ws.send({ type: 'full-reload', path: '*' })
          return
        }

        next()
      })
    },
  }
}
