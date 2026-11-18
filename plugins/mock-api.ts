// ch10-3：开发期 Mock API。
// 学习点：configureServer 拿到 Connect 实例，可以挂任意中间件；apply: 'serve' 让它在构建时完全跳过。
import type { Plugin } from 'vite'

const users = [
  { id: 1, name: 'Alice', role: 'frontend' },
  { id: 2, name: 'Bob', role: 'backend' },
  { id: 3, name: 'Carol', role: 'designer' },
]

export function mockApiPlugin(): Plugin {
  return {
    name: 'lab:mock-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/api/mock/users', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ total: users.length, users }))
      })
    },
  }
}
