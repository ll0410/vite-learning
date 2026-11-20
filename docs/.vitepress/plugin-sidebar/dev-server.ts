import type { DefaultTheme } from 'vitepress'

export const devServerSidebar: DefaultTheme.SidebarItem = {
  text: '5. dev server 中间件',
  items: [
    { text: '14. Mock API', link: '/plugins/dev-server/01-mock-api' },
    { text: '15. 代理转发兜底', link: '/plugins/dev-server/02-proxy-fallback' },
    { text: '16. 运行时配置与清缓存', link: '/plugins/dev-server/03-debug-endpoints' },
    { text: '17. 模拟 SSO 与内存上传', link: '/plugins/dev-server/04-auth-upload' },
  ],
}
