// 插件示例：提供开发期运行时配置查询和模块缓存清理接口。
// 学习点：configureServer 可读取 ViteDevServer，并通过 moduleGraph/WebSocket 主动刷新页面。
import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

export function debugEndpointsPlugin(): Plugin {
  return {
    name: 'lab:debug-endpoints',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/api/lab/debug', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

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
          server.ws.send({ type: 'full-reload', path: '*' })
          return
        }

        next()
      })
    },
  }
}
