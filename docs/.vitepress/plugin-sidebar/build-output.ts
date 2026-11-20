import type { DefaultTheme } from 'vitepress'

export const buildOutputSidebar: DefaultTheme.SidebarItem = {
  text: '6. 构建产物后处理',
  collapsed: true,
  items: [
    { text: '18. SSR / 资源映射 manifest', link: '/plugins/build-output/01-ssr-manifest' },
  ],
}
