// 插件示例：用内存会话模拟 SSO 回调、登录态查询和受限二进制上传。
// 仅用于开发教学：会话不写盘，上传不保存文件，服务重启后状态即清空。
import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const TEACHING_CODE = 'vite-lab-teaching-code'
const SESSION_COOKIE = 'vite_lab_session'
const DEMO_RETURN_PATH = '/plugins/dev-server/auth-upload-demo?login=success'
const MAX_UPLOAD_BYTES = 64 * 1024

interface SessionUser {
  id: string
  name: string
}

/**
 * 统一发送不缓存的 JSON 响应。
 * res.end 会结束响应，因此各分支发送后都会 return，不再把请求交给后续中间件。
 */
function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * 从请求 Cookie 中取出会话令牌，再查询对应的内存用户。
 * HttpOnly 只禁止页面 JavaScript 读取 Cookie，浏览器仍会按 Path 等规则自动携带它。
 */
function getSessionUser(req: IncomingMessage, sessions: Map<string, SessionUser>) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)vite_lab_session=([^;]+)/)
  return match ? sessions.get(match[1]) : undefined
}

/**
 * 读取并校验查询参数中的文件名，只保留最后一个路径段，同时拒绝控制字符。
 * 即使客户端传入 ../a.txt 或 Windows 路径，响应中也只会使用 a.txt 这样的纯文件名。
 */
function getUploadName(url: URL) {
  const name = url.searchParams.get('filename')?.split(/[\\/]/).pop()?.trim()
  if (!name || name.length > 128 || /[\u0000-\u001f\u007f]/.test(name)) return
  return name
}

/**
 * 创建认证与上传教学插件，提供 SSO 回调、会话查询和原始字节上传三个接口。
 * 外部路径统一以 /api/lab/auth 开头；apply: 'serve' 表示只在开发服务器中注册，构建时不会执行。
 */
export function authUploadPlugin(): Plugin {
  return {
    name: 'lab:auth-upload',
    apply: 'serve',

    // configureServer 在 Vite 安装内部中间件之前执行，可直接向 Connect 队列注册开发接口。
    configureServer(server) {
      // Map 位于本次服务器实例的闭包中：所有请求共享会话，但服务重启后数据自然清空。
      const sessions = new Map<string, SessionUser>()

      // 挂载前缀不会出现在处理器内的 req.url 中。
      // 例如请求 /api/lab/auth/session，进入此处后只需匹配 /session。
      server.middlewares.use('/api/lab/auth', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        // SSO 回调流程：校验授权码 → 建立服务端会话 → 设置 Cookie → 通过 302 回到业务页面。
        if (url.pathname === '/sso/callback') {
          if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET')
            sendJson(res, 405, { error: 'method_not_allowed' })
            return
          }
          if (url.searchParams.get('code') !== TEACHING_CODE) {
            sendJson(res, 401, { error: 'invalid_teaching_code' })
            return
          }

          // Cookie 只保存随机会话令牌，用户数据留在服务端，页面无法直接读取或篡改这份 Map。
          const token = randomUUID()
          sessions.set(token, { id: 'lab-user', name: 'Vite Learner' })
          res.statusCode = 302
          res.setHeader('Location', DEMO_RETURN_PATH)
          res.setHeader(
            'Set-Cookie',
            `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/`,
          )
          res.setHeader('Cache-Control', 'no-store')
          res.end()
          return
        }

        // 页面用此接口查询当前 Cookie 对应的登录态；未登录也返回 200，仅将 authenticated 设为 false。
        if (url.pathname === '/session') {
          if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET')
            sendJson(res, 405, { error: 'method_not_allowed' })
            return
          }

          const user = getSessionUser(req, sessions)
          sendJson(res, 200, { authenticated: Boolean(user), user: user ?? null })
          return
        }

        // 上传按“方法 → 登录态 → 媒体类型 → 文件名 → 大小”的顺序尽早拒绝无效请求。
        if (url.pathname === '/upload') {
          if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST')
            sendJson(res, 405, { error: 'method_not_allowed' })
            return
          }
          if (!getSessionUser(req, sessions)) {
            sendJson(res, 401, { error: 'authentication_required' })
            return
          }
          if (req.headers['content-type']?.split(';')[0] !== 'application/octet-stream') {
            sendJson(res, 415, { error: 'raw_bytes_required' })
            return
          }

          const name = getUploadName(url)
          if (!name) {
            sendJson(res, 400, { error: 'invalid_filename' })
            return
          }

          // Content-Length 用于提前拒绝；流式计数继续兜底缺失或伪造长度的情况。
          const declaredSize = Number(req.headers['content-length'])
          if (Number.isFinite(declaredSize) && declaredSize > MAX_UPLOAD_BYTES) {
            req.resume()
            sendJson(res, 413, { error: 'file_too_large', maxBytes: MAX_UPLOAD_BYTES })
            return
          }

          // Node 请求体是可读流：data 分批到达，end 才表示接收完成，不能假设一次 data 就拿到完整文件。
          const chunks: Buffer[] = []
          let size = 0
          let tooLarge = false

          req.on('data', (chunk: Buffer) => {
            // 超限后继续消费但丢弃数据，既避免连接悬挂，也不再累积 Buffer。
            size += chunk.length
            if (size > MAX_UPLOAD_BYTES) {
              tooLarge = true
              chunks.length = 0
              return
            }
            if (!tooLarge) chunks.push(chunk)
          })
          req.on('error', next)
          req.on('end', () => {
            if (tooLarge) {
              sendJson(res, 413, { error: 'file_too_large', maxBytes: MAX_UPLOAD_BYTES })
              return
            }

            // 仅在流正常结束且未超限时拼接内容；响应只包含元信息与摘要，不会把文件写入磁盘。
            const content = Buffer.concat(chunks, size)
            sendJson(res, 200, {
              name,
              size,
              sha256: createHash('sha256').update(content).digest('hex'),
            })
          })
          return
        }

        // 未认领的子路径调用 next，继续进入后续中间件；已发送响应的分支都在前面直接 return。
        next()
      })
    },
  }
}
