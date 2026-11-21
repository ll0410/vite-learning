// ch10-4：生产构建时移除 console.debug。
// 插件实验：受控 fixture 还演示单行 console、debugger 和 test-only 块裁剪。
import type { Plugin } from 'vite'

// 教学版只匹配整行语句和显式标记块；复杂生产场景应使用 AST 转换。
const controlledFixtureRoot = '/src/plugin-lab/fixtures/code-transform/'

/**
 * 创建生产构建清理插件。
 * 普通 /src/ 模块只移除整行 console.debug；受控 fixture 还会移除其他 console、debugger 和 test-only 块。
 * transform 返回 undefined 表示模块未改动，避免把未改动模块标记为已转换。
 */
export function stripDebugPlugin(): Plugin {
  return {
    name: 'lab:strip-debug',
    apply: 'build',
    // 在 Vue/TS 转译之前先处理源码，避免 debug 语句被编译成其他形式
    enforce: 'pre',

    transform(code, id) {
      // id 是当前模块标识；先限制在 /src/ 内，避免扫描依赖包等无关模块。
      if (!id.includes('/src/')) return

      const isControlledFixture = id.includes(controlledFixtureRoot)
      // 普通模块先做廉价字符串检查；fixture 还需处理其他标记，因此不能提前返回。
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

      // map: null 表示没有为删除行后的代码提供 source map；教学 fixture 可接受这一简化。
      // 真实项目若需保留准确断点位置，应使用 MagicString 或 AST 工具生成源码映射。
      return changed ? { code: cleaned, map: null } : undefined
    },
  }
}
