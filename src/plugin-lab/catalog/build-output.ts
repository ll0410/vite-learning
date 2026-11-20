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
    {
      id: 'build-output-deployment-artifacts',
      title: '19. 生成 hash 版本文件和 CDN 上传清单',
      guide: '/plugins/build-output/02-deployment-artifacts',
      buildOnly: true,
      verify: '执行 pnpm build，抽样比对 version.json / cdn-manifest.json 的 SHA-256 与文件内容一致，URL 均为 cdn.example.com 前缀。',
    },
    {
      id: 'build-output-static-deployment',
      title: '20. 生成 SRI、robots.txt、_headers',
      guide: '/plugins/build-output/03-static-deployment',
      buildOnly: true,
      verify: '执行 pnpm build，校验 index.html 与 admin.html 的 integrity 与产物 SHA-384 一致，并检查 robots.txt / _headers。',
    },
  ],
}
