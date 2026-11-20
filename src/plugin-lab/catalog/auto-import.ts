import type { PluginLabCategory } from '../types'

export const autoImportCategory: PluginLabCategory = {
  id: 'auto-import',
  title: '3. 按需导入 / 自动引入',
  items: [
    {
      id: 'auto-import-api-components',
      title: '9. API 自动导入与组件按需引入',
      guide: '/plugins/auto-import/01-auto-import',
      demo: '/plugins/auto-import',
      verify: '点击计数验证 ref 与组件导入，并在 Inspect 中查看 lab:auto-import 的转换结果。',
    },
  ],
}
