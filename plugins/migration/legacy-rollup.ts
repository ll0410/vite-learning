import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const FIXTURE_ENTRY = fileURLToPath(
  new URL('../../src/plugin-lab/fixtures/migration/legacy-entry.ts', import.meta.url),
)
const PLACEHOLDER = '__LEGACY_ROLLUP_MESSAGE__'
const REPLACEMENT = 'reused-legacy-rollup-value'

// 核心逻辑只使用 Rollup 风格钩子，不依赖 Vue 或 Vite 专有能力。
function createLegacyRollupPlugin(): Plugin {
  let fixtureReference = ''
  let replacements = 0

  return {
    name: 'legacy-rollup-compatible-core',

    buildStart() {
      replacements = 0
      // 仅为产物验收注册独立 fixture，不需要页面 import。
      fixtureReference = this.emitFile({
        type: 'chunk',
        id: FIXTURE_ENTRY,
        name: 'legacy-rollup-fixture',
      })
    },

    transform(code, id) {
      if (id !== FIXTURE_ENTRY) return

      const segments = code.split(PLACEHOLDER)
      replacements = segments.length - 1
      if (replacements === 0) return

      return { code: segments.join(REPLACEMENT), map: null }
    },

    generateBundle() {
      const output = this.getFileName(fixtureReference)
      const metadata = {
        plugin: 'lab:legacy-rollup',
        source: 'src/plugin-lab/fixtures/migration/legacy-entry.ts',
        output,
        placeholder: PLACEHOLDER,
        replacement: REPLACEMENT,
        replacements,
      }

      this.emitFile({
        type: 'asset',
        fileName: 'legacy-rollup-migration.json',
        source: `${JSON.stringify(metadata, null, 2)}\n`,
      })
    },
  }
}

// Vite 适配层只补充执行模式和统一的插件名。
export function legacyRollupPlugin(): Plugin {
  return {
    ...createLegacyRollupPlugin(),
    name: 'lab:legacy-rollup',
    apply: 'build',
  }
}
