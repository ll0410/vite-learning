import type { PluginLabCategory } from '../types'

export const customFilesCategory: PluginLabCategory = {
  id: 'custom-files',
  title: '7. 自定义文件类型',
  items: [
    {
      id: 'custom-file-types',
      title: '22. Markdown → Vue 组件、GraphQL → 文档、CSV → 数据模块',
      guide: '/plugins/custom-files/01-custom-file-types',
      demo: '/plugins/custom-files-demo',
      verify: '导入三种受控 fixture，检查 Markdown 转义、操作名和 CSV 表格，并验证修改文件后的整页刷新。',
    },
  ],
}
