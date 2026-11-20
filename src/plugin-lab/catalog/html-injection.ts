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
  ],
}
