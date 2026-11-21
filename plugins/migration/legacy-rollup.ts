// 插件示例：通过薄适配层复用 Rollup 风格核心插件，并输出迁移验收元数据。
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// 以当前模块 URL 定位 fixture，再转成绝对文件路径，避免解析结果依赖启动命令所在目录。
const FIXTURE_ENTRY = fileURLToPath(
  new URL('../../src/plugin-lab/fixtures/migration/legacy-entry.ts', import.meta.url),
)
const PLACEHOLDER = '__LEGACY_ROLLUP_MESSAGE__'
const REPLACEMENT = 'reused-legacy-rollup-value'

/**
 * 核心逻辑只使用 Rollup 风格钩子，不依赖 Vue 或 Vite 专有能力。
 *
 * 钩子顺序为：buildStart 注册额外 chunk，transform 替换其中的占位符，generateBundle 再取得最终文件名。
 * 使用 Vite 的 Plugin 类型只是为了复用项目类型；这里调用的钩子与上下文 API 均来自 Rollup。
 */
function createLegacyRollupPlugin(): Plugin {
  // 发射 chunk 时先得到内部引用 ID，等输出文件名确定后再用 getFileName 换取实际路径。
  let fixtureReference = ''
  let replacements = 0

  return {
    name: 'legacy-rollup-compatible-core',

    buildStart() {
      // 每次构建重新计数，避免 watch 模式的重复构建累加旧结果。
      replacements = 0
      // 仅为产物验收注册独立 fixture，不需要页面 import。
      fixtureReference = this.emitFile({
        type: 'chunk',
        id: FIXTURE_ENTRY,
        name: 'legacy-rollup-fixture',
      })
    },

    transform(code, id) {
      // transform 会经过许多模块，用绝对路径精确认领 fixture，避免改动业务源码。
      if (id !== FIXTURE_ENTRY) return

      const segments = code.split(PLACEHOLDER)
      replacements = segments.length - 1
      if (replacements === 0) return

      return { code: segments.join(REPLACEMENT), map: null }
    },

    generateBundle() {
      // 此阶段输出文件名（包括内容 hash）已确定，可以把之前的引用 ID 解析为实际路径。
      const output = this.getFileName(fixtureReference)
      const metadata = {
        plugin: 'lab:legacy-rollup',
        source: 'src/plugin-lab/fixtures/migration/legacy-entry.ts',
        output,
        placeholder: PLACEHOLDER,
        replacement: REPLACEMENT,
        replacements,
      }

      // 额外发射 JSON asset 记录输出路径和替换次数，便于构建后的验收脚本直接断言迁移结果。
      this.emitFile({
        type: 'asset',
        fileName: 'legacy-rollup-migration.json',
        source: `${JSON.stringify(metadata, null, 2)}\n`,
      })
    },
  }
}

/**
 * Vite 适配层只补充执行模式和统一的插件名。
 * 对象展开复用核心插件的全部钩子，apply: 'build' 则避免开发服务器执行这套构建验收逻辑。
 */
export function legacyRollupPlugin(): Plugin {
  return {
    ...createLegacyRollupPlugin(),
    name: 'lab:legacy-rollup',
    apply: 'build',
  }
}
