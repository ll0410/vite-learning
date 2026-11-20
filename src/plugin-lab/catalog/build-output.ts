import type { PluginLabCategory } from '../types'

export const buildOutputCategory: PluginLabCategory = {
  id: 'build-output',
  title: '6. 构建产物后处理',
  items: [
    {
      id: 'build-output-ssr-manifest',
      title: '18. 生成 SSR / 资源映射 manifest',
      guide: '/plugins/build-output/01-ssr-manifest',
      buildOnly: true,
      verify: '执行 pnpm build，确认 dist/lab-manifest.json 的文件都存在，且入口与 index.html 引用一致。',
    },
  ],
}
