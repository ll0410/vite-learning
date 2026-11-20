import type { PluginLabCategory } from '../types'

export const codeTransformCategory: PluginLabCategory = {
  id: 'code-transform',
  title: '2. 构建期代码改写 / 裁剪',
  items: [
    {
      id: 'strip-debug',
      title: '5. 移除 console / debugger / 测试代码',
      guide: '/plugins/code-transform/01-strip-debug',
      buildOnly: true,
      verify: 'dev 保留受控调试源码；build 断言 console/debugger/test-only 哨兵消失，且 ch10 console.debug 断言不回归。',
    },
    {
      id: 'inject-tracking',
      title: '6. 组件挂载点埋点自动注入',
      guide: '/plugins/code-transform/02-inject-tracking',
      demo: '/plugins/code-transform#inject-tracking',
      verify: '进入分类页自动记录 code-transform-demo-mounted；Inspect 可见别名注入，生产 chunk 保留事件。',
    },
  ],
}
