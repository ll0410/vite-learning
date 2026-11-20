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
  ],
}
