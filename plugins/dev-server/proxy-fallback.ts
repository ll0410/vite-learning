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

/** 发送不缓存的 JSON 响应；res.end 后当前请求即由本中间件处理完毕。 */
function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * 读取实际监听地址，兼容默认端口被占用后自动递增的情况。
 * 0.0.0.0 和 :: 是监听所有网卡的通配地址，回环请求需换成本机地址；IPv6 字面量还要加上 []。
 */
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

/**
 * 创建代理降级教学插件：/primary/* 模拟主服务，/resource 负责请求主服务并按结果降级。
 * mode=success 返回主接口数据，mode=http-error 和 network-error 分别演示 HTTP 失败与网络异常。
 * apply: 'serve' 限定为开发期能力，不会把这套中间件带入生产构建。
 */
export function proxyFallbackPlugin(): Plugin {
  return {
    name: 'lab:proxy-fallback',
    apply: 'serve',

    // 直接调用 use 会在 Vite 内部中间件之前注册；未命中的请求仍可通过 next 进入后续队列。
    configureServer(server) {
      // Connect 会暂时移除挂载前缀，因此外部 /api/lab/proxy/resource 在这里对应 /resource。
      server.middlewares.use('/api/lab/proxy', async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        // /primary/* 分支模拟远端服务；/resource 会发 HTTP 请求访问它们，而不是直接调用这些分支。
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
        // 只有 /resource 是聚合接口，其余未认领路径必须放行，避免阻断后续中间件。
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

        // 服务端 fetch 使用真实监听 origin 发起回环请求，让主接口也完整经过一次 HTTP 与中间件流程。
        try {
          const primaryUrl = new URL(
            `/api/lab/proxy/primary/${primaryTargets[mode]}`,
            getRuntimeOrigin(server),
          )
          const primaryResponse = await fetch(primaryUrl, {
            headers: { Accept: 'application/json' },
          })
          // fetch 遇到 404/503 等 HTTP 状态不会 reject，必须检查 ok 才能识别这类主接口失败。
          if (!primaryResponse.ok) {
            sendJson(res, 200, {
              source: 'fallback',
              reason: `http-${primaryResponse.status}`,
              message: '主接口返回非 2xx，已使用本地兜底数据',
            })
            return
          }

          // 成功时透传主接口的 JSON 数据，因此响应中的 source 仍然是 primary。
          sendJson(res, 200, await primaryResponse.json())
        } catch {
          // 连接断开、DNS 失败等网络异常进入此分支，用 200 和 source=fallback 明确表示降级结果。
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
