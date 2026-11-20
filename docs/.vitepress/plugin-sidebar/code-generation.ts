import type { DefaultTheme } from 'vitepress'

export const codeGenerationSidebar: DefaultTheme.SidebarItem = {
  text: '1. 代码生成 / 虚拟模块',
  items: [
    { text: '1. 自动生成客户端、路由数据与 i18n', link: '/plugins/code-generation/01-generated-modules' },
    { text: '2. 编译期版本、Git 与环境常量', link: '/plugins/code-generation/02-build-constants' },
    { text: '3. 组件自动注册与约定式路由', link: '/plugins/code-generation/03-auto-discovery' },
    { text: '4. 大体积静态数据按需导出', link: '/plugins/code-generation/04-on-demand-data' },
  ],
}
