// 插件示例：生产构建前移除 DEV_ONLY 块，并替换受控 fixture 中的环境占位符。
// apply: 'build' + enforce: 'pre' 让转换只发生在构建期且早于其他转译。
import type { Plugin } from 'vite'

// 逐行标记裁剪仅用于固定 fixture；通用条件编译应基于 AST 保留语义与 sourcemap。
const targetModule = '/src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts'

export function conditionalBuildPlugin(): Plugin {
  return {
    name: 'lab:conditional-build',
    apply: 'build',
    enforce: 'pre',

    transform(code, id) {
      const cleanId = id.split('?', 1)[0]
      if (!cleanId.endsWith(targetModule)) return

      let inDevOnlyBlock = false
      const withoutDevOnly = code
        .split('\n')
        .filter((line) => {
          if (/^\s*\/\/\s*DEV_ONLY:start\s*$/.test(line)) {
            inDevOnlyBlock = true
            return false
          }
          if (/^\s*\/\/\s*DEV_ONLY:end\s*$/.test(line)) {
            inDevOnlyBlock = false
            return false
          }
          return !inDevOnlyBlock
        })
        .join('\n')

      const transformed = withoutDevOnly
        .replaceAll('__LAB_PUBLIC_API_ORIGIN__', 'https://public-api.example.com')
        .replaceAll('__LAB_PUBLIC_LABS_ENABLED__', 'true')

      return { code: transformed, map: null }
    },
  }
}
