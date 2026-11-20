// 插件示例：模拟主接口，并在 HTTP 状态异常或网络错误时返回本地兜底数据。
// 学习点：开发期中间件可直接组合 Node fetch、运行时地址和自定义响应。
import type { ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'

type ProxyMode = 'success' | 'http-error' | 'network-error'

const primaryTargets: Record<ProxyMode, string> = {
  success: 'success',
  'http-error': 'http-error',
  'network-error': 'network-error',
}

function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

// 读取实际监听地址，兼容默认端口被占用后自动递增的情况。
function getRuntimeOrigin(server: ViteDevServer) {
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('开发服务器尚未监听 TCP 端口')
  }
  const hostname =
    address.address === '0.0.0.0'
      ? '127.0.0.1'
      : address.address === '::'
        ? '[::1]'
        : address.family === 'IPv6'
          ? `[${address.address}]`
          : address.address
  return `http://${hostname}:${address.port}`
}

export function proxyFallbackPlugin(): Plugin {
  return {
    name: 'lab:proxy-fallback',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/api/lab/proxy', async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        if (url.pathname === '/primary/success') {
          sendJson(res, 200, { source: 'primary', message: '本地主接口成功' })
          return
        }
        if (url.pathname === '/primary/http-error') {
          sendJson(res, 503, { source: 'primary', message: '模拟主接口失败' })
          return
        }
        if (url.pathname === '/primary/network-error') {
          // 主动断开连接，让 resource 请求中的 fetch 进入网络错误分支。
          req.socket.destroy()
          return
        }
        if (url.pathname !== '/resource') {
          next()
          return
        }
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET')
          sendJson(res, 405, { error: 'method_not_allowed' })
          return
        }

        const requestedMode = url.searchParams.get('mode') ?? 'success'
        if (!Object.hasOwn(primaryTargets, requestedMode)) {
          sendJson(res, 400, { error: 'invalid_mode' })
          return
        }
        const mode = requestedMode as ProxyMode

        try {
          const primaryUrl = new URL(
            `/api/lab/proxy/primary/${primaryTargets[mode]}`,
            getRuntimeOrigin(server),
          )
          const primaryResponse = await fetch(primaryUrl, {
            headers: { Accept: 'application/json' },
          })
          if (!primaryResponse.ok) {
            sendJson(res, 200, {
              source: 'fallback',
              reason: `http-${primaryResponse.status}`,
              message: '主接口返回非 2xx，已使用本地兜底数据',
            })
            return
          }

          sendJson(res, 200, await primaryResponse.json())
        } catch {
          sendJson(res, 200, {
            source: 'fallback',
            reason: 'network-error',
            message: '主接口网络错误，已使用本地兜底数据',
          })
        }
      })
    },
  }
}
