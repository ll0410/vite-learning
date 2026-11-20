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
    {
      id: 'build-constants',
      title: '2. 编译期常量：版本号、构建时间、Git commit、环境标识',
      guide: '/plugins/code-generation/02-build-constants.html',
      demo: '/plugin-lab/code-generation#build-constants',
      verify: '核对版本、构建时间、Git 短提交和当前 Vite mode。',
    },
    {
      id: 'auto-discovery',
      title: '3. 组件自动注册、目录约定式路由',
      guide: '/plugins/code-generation/03-auto-discovery.html',
      demo: '/plugin-lab/code-generation#auto-discovery',
      verify: '渲染自动注册组件，并导航、刷新真实的约定式页面。',
    },
  ],
}
