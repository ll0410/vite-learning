import type { DefaultTheme } from 'vitepress'

export const htmlInjectionSidebar: DefaultTheme.SidebarItem = {
  text: '4. HTML 注入',
  collapsed: true,
  items: [
    { text: '10. 注入 CDN、监控与统计脚本', link: '/plugins/html-injection/01-inject-scripts' },
    { text: '11. 注入 CSP、主题与首屏骨架', link: '/plugins/html-injection/02-head-assets' },
    { text: '12. MPA 按入口注入不同标签', link: '/plugins/html-injection/03-mpa-entry' },
  ],
}
