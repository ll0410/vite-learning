// ch10-3：开发期 Mock API。
// 学习点：configureServer 拿到 Connect 实例，可以挂任意中间件；apply: 'serve' 让它在构建时完全跳过。
import type { Plugin } from 'vite'

const users = [
  { id: 1, name: 'Alice', role: 'frontend' },
  { id: 2, name: 'Bob', role: 'backend' },
  { id: 3, name: 'Carol', role: 'designer' },
]

/**
 * 创建仅在开发环境生效的 Mock API 插件，无需启动额外 HTTP 服务。
 * 请求 /api/mock/users 时会得到 { total, users } 结构的 JSON；生产构建会跳过整个插件。
 */
export function mockApiPlugin(): Plugin {
  return {
    name: 'lab:mock-api',
    apply: 'serve',

    // configureServer 提供 Connect 中间件容器；与页面同源挂载 /api 路径可避免额外跨域配置。
    // 中间件调用 res.end 后请求已经处理，不会再进入 Vite 后续的静态文件或 SPA fallback。
    configureServer(server) {
      server.middlewares.use('/api/mock/users', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ total: users.length, users }))
      })
    },
  }
}
