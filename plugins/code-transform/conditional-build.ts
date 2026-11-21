// 插件示例：生产构建前移除 DEV_ONLY 块，并替换受控 fixture 中的环境占位符。
// apply: 'build' + enforce: 'pre' 让转换只发生在构建期且早于其他转译。
import type { Plugin } from 'vite'

// 逐行标记裁剪仅用于固定 fixture；通用条件编译应基于 AST 保留语义与 sourcemap。
const targetModule = '/src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts'

/**
 * 创建固定 fixture 的条件构建插件：生产构建时删除 DEV_ONLY 标记及其中内容，
 * 再把环境占位符替换为公开 API 地址和布尔字面量。
 * 例如 __LAB_PUBLIC_LABS_ENABLED__ 会在打包前变为 true，而不是字符串 'true'。
 */
export function conditionalBuildPlugin(): Plugin {
  return {
    name: 'lab:conditional-build',
    apply: 'build',
    enforce: 'pre',

    transform(code, id) {
      // Vite 模块 ID 可能带 ?query；去掉查询部分后再限定目标文件，避免误改其他模块。
      const cleanId = id.split('?', 1)[0]
      if (!cleanId.endsWith(targetModule)) return

      // 标记行本身也不保留；inDevOnlyBlock 为 true 时过滤标记之间的每一行。
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

      // 占位符替换发生在源码转换阶段，业务模块收到的是替换后的 JavaScript 表达式。
      const transformed = withoutDevOnly
        .replaceAll('__LAB_PUBLIC_API_ORIGIN__', 'https://public-api.example.com')
        .replaceAll('__LAB_PUBLIC_LABS_ENABLED__', 'true')

      // 本例未生成 source map；map: null 明确表示不提供映射，真实项目应保留准确行列信息。
      return { code: transformed, map: null }
    },
  }
}
