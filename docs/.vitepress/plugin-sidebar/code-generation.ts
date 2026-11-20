import type { DefaultTheme } from 'vitepress'

export const codeGenerationSidebar: DefaultTheme.SidebarItem = {
  text: '1. 代码生成 / 虚拟模块',
  collapsed: false,
  items: [
    { text: '1. 自动生成客户端、路由数据与 i18n', link: '/plugins/code-generation/01-generated-modules' },
  ],
}
