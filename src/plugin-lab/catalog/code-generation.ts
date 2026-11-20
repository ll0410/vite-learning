import type { PluginLabCategory } from '../types'

export const codeGenerationCategory: PluginLabCategory = {
  id: 'code-generation',
  title: '1. 代码生成 / 虚拟模块',
  items: [
    {
      id: 'generated-modules',
      title: '1. 自动生成 API 客户端、路由表、i18n 资源聚合',
      guide: '/plugins/code-generation/01-generated-modules.html',
      demo: '/plugin-lab/code-generation#generated-modules',
      verify: '调用生成的用户 API，查看路由数据并切换中英文资源。',
    },
  ],
}
