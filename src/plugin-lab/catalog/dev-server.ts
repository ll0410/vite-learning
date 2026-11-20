import type { PluginLabCategory } from '../types'

export const devServerCategory: PluginLabCategory = {
  id: 'dev-server',
  title: '5. dev server 中间件',
  items: [
    {
      id: 'dev-server-mock-api',
      title: '14. Mock API',
      guide: '/plugins/dev-server/01-mock-api',
      demo: '/plugins/dev-server/mock-api',
      verify: '请求 /api/mock/users，确认页面与 Home 均返回 Alice、Bob、Carol 三个用户。',
    },
    {
      id: 'dev-server-proxy-fallback',
      title: '15. 本地代理特殊逻辑与接口转发兜底',
      guide: '/plugins/dev-server/02-proxy-fallback',
      demo: '/plugins/dev-server/proxy-fallback-demo',
      verify: '分别验证主接口成功、HTTP 503 和网络错误，确认来源为 primary 或 fallback。',
    },
    {
      id: 'dev-server-debug-endpoints',
      title: '16. 调试接口：查看运行时配置、清缓存',
      guide: '/plugins/dev-server/03-debug-endpoints',
      demo: '/plugins/dev-server/debug-endpoints-demo',
      verify: '检查配置白名单和 GET/POST 状态码，清 moduleGraph 后观察 full-reload。',
    },
    {
      id: 'dev-server-auth-upload',
      title: '17. 模拟 SSO 登录回调与文件上传',
      guide: '/plugins/dev-server/04-auth-upload',
      demo: '/plugins/dev-server/auth-upload-demo',
      verify: '验证教学 code、Cookie 回跳和会话；上传小文件返回大小与 SHA-256，超限返回 413。',
    },
  ],
}
