// ch10-4：生产构建时移除 console.debug。
// 学习点：transform 钩子 + apply: 'build' + enforce: 'pre'。
import type { Plugin } from 'vite'

export function stripDebugPlugin(): Plugin {
  return {
    name: 'lab:strip-debug',
    apply: 'build',
    // 在 Vue/TS 转译之前先处理源码，避免 debug 语句被编译成其他形式
    enforce: 'pre',

    transform(code, id) {
      if (!id.includes('/src/') || !code.includes('console.debug')) return

      const cleaned = code
        .split('\n')
        .filter((line) => !/^\s*console\.debug\(/.test(line))
        .join('\n')

      return { code: cleaned, map: null }
    },
  }
}
