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

function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function getSessionUser(req: IncomingMessage, sessions: Map<string, SessionUser>) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)vite_lab_session=([^;]+)/)
  return match ? sessions.get(match[1]) : undefined
}

function getUploadName(url: URL) {
  const name = url.searchParams.get('filename')?.split(/[\\/]/).pop()?.trim()
  if (!name || name.length > 128 || /[\u0000-\u001f\u007f]/.test(name)) return
  return name
}

export function authUploadPlugin(): Plugin {
  return {
    name: 'lab:auth-upload',
    apply: 'serve',

    configureServer(server) {
      const sessions = new Map<string, SessionUser>()

      server.middlewares.use('/api/lab/auth', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

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

            const content = Buffer.concat(chunks, size)
            sendJson(res, 200, {
              name,
              size,
              sha256: createHash('sha256').update(content).digest('hex'),
            })
          })
          return
        }

        next()
      })
    },
  }
}
