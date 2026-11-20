import type { PluginLabCategory } from '../types'

export const htmlInjectionCategory: PluginLabCategory = {
  id: 'html-injection',
  title: '4. HTML 注入',
  items: [
    {
      id: 'html-inject-scripts',
      title: '10. 注入 CDN、监控脚本、统计代码',
      guide: '/plugins/html-injection/01-inject-scripts',
      demo: '/plugins/html-injection#inject-scripts',
      verify: '验证三个本地 stub 的加载标记、执行顺序与实际 script 标签。',
    },
    {
      id: 'html-head-assets',
      title: '11. 注入 CSP meta、主题变量、首屏骨架',
      guide: '/plugins/html-injection/02-head-assets',
      demo: '/plugins/html-injection#head-assets',
      verify: '读取 CSP meta 与主题计算样式，确认 Vue 挂载后骨架无残留。',
    },
  ],
}
