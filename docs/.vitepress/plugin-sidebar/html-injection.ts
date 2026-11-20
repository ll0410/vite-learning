import type { DefaultTheme } from 'vitepress'

export const htmlInjectionSidebar: DefaultTheme.SidebarItem = {
  text: '4. HTML 注入',
  collapsed: true,
  items: [
    { text: '10. 注入 CDN、监控与统计脚本', link: '/plugins/html-injection/01-inject-scripts' },
  ],
}
