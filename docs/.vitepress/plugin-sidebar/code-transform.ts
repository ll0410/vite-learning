import type { DefaultTheme } from 'vitepress'

export const codeTransformSidebar: DefaultTheme.SidebarItem = {
  text: '2. 构建期代码改写 / 裁剪',
  items: [
    { text: '05 移除 console / debugger / 测试代码', link: '/plugins/code-transform/01-strip-debug' },
    { text: '06 组件挂载点埋点自动注入', link: '/plugins/code-transform/02-inject-tracking' },
    { text: '07 多租户 / 多品牌差异化构建', link: '/plugins/code-transform/03-tenant-build' },
    { text: '08 生产配置替换与条件编译', link: '/plugins/code-transform/04-conditional-build' },
  ],
}
