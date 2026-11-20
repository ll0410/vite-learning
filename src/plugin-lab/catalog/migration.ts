import type { PluginLabCategory } from '../types'

export const migrationCategory: PluginLabCategory = {
  id: 'migration',
  title: '8. 迁移 webpack 生态 / 兼容 Rollup 钩子',
  items: [
    {
      id: 'legacy-rollup',
      title: '23. 复用老工具链中的 Rollup 兼容逻辑',
      guide: '/plugins/migration/01-legacy-rollup',
      buildOnly: true,
      verify:
        '构建后断言限定 fixture 的标记已替换、未授权模块保持原样，并校验迁移元数据引用真实 chunk。',
    },
  ],
}
