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
  ],
}
