// ch10-4：生产构建时移除 console.debug。
// 插件实验：受控 fixture 还演示单行 console、debugger 和 test-only 块裁剪。
import type { Plugin } from 'vite'

// 教学版只匹配整行语句和显式标记块；复杂生产场景应使用 AST 转换。
const controlledFixtureRoot = '/src/plugin-lab/fixtures/code-transform/'

export function stripDebugPlugin(): Plugin {
  return {
    name: 'lab:strip-debug',
    apply: 'build',
    // 在 Vue/TS 转译之前先处理源码，避免 debug 语句被编译成其他形式
    enforce: 'pre',

    transform(code, id) {
      if (!id.includes('/src/')) return

      const isControlledFixture = id.includes(controlledFixtureRoot)
      if (!isControlledFixture && !code.includes('console.debug')) return

      let inTestOnlyBlock = false
      let changed = false
      const cleaned = code
        .split('\n')
        .filter((line) => {
          if (isControlledFixture && /^\s*\/\/\s*test-only:start\s*$/.test(line)) {
            inTestOnlyBlock = true
            changed = true
            return false
          }
          if (isControlledFixture && /^\s*\/\/\s*test-only:end\s*$/.test(line)) {
            inTestOnlyBlock = false
            changed = true
            return false
          }
          if (inTestOnlyBlock) {
            changed = true
            return false
          }

          const isConsole = isControlledFixture
            ? /^\s*console\.(?:log|info|warn|error|debug)\(.*\);?\s*$/.test(line)
            : /^\s*console\.debug\(.*\);?\s*$/.test(line)
          const isDebugger = isControlledFixture && /^\s*debugger;?(?:\s*\/\/.*)?\s*$/.test(line)
          if (!isConsole && !isDebugger) return true

          changed = true
          return false
        })
        .join('\n')

      return changed ? { code: cleaned, map: null } : undefined
    },
  }
}
