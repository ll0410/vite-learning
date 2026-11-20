import type { DefaultTheme } from 'vitepress'

export const buildOutputSidebar: DefaultTheme.SidebarItem = {
  text: '6. 构建产物后处理',
  items: [
    { text: '18. SSR / 资源映射 manifest', link: '/plugins/build-output/01-ssr-manifest' },
    { text: '19. 版本文件与 CDN 清单', link: '/plugins/build-output/02-deployment-artifacts' },
    { text: '20. SRI 与静态托管文件', link: '/plugins/build-output/03-static-deployment' },
    { text: '21. 替换产物占位域名', link: '/plugins/build-output/04-replace-built-assets' },
  ],
}
