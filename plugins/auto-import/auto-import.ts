// 插件示例：在 Vue SFC 的 <script setup> 中按需补齐 API 与组件导入。
// 学习点：enforce: 'pre' 让源码扫描早于 Vue 编译，buildStart 同步生成类型声明。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'

export interface AutoImportOptions {
  include: RegExp
  imports: Record<string, string>
  components: Record<string, string>
  dts?: string
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 教学版用正则避免重复导入；复杂项目应改用 AST，排除注释、字符串等误匹配。
function hasBinding(script: string, identifier: string) {
  const name = escapeRegExp(identifier)
  const declaration = new RegExp(`\\b(?:const|let|var|function|class)\\s+${name}\\b`)
  const imported = new RegExp(
    `^[\\t ]*import\\s+[^\\n]*\\b${name}\\b[^\\n]*\\s+from\\s*['"]`,
    'm',
  )

  return declaration.test(script) || imported.test(script)
}

function hasApiUsage(script: string, identifier: string) {
  const name = escapeRegExp(identifier)
  return new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(script)
}

function hasComponentUsage(template: string, component: string) {
  return new RegExp(`<${escapeRegExp(component)}(?=[\\s/>])`).test(template)
}

function renderDeclarations(options: AutoImportOptions) {
  const apis = Object.entries(options.imports).sort(([a], [b]) => a.localeCompare(b))
  const components = Object.entries(options.components).sort(([a], [b]) => a.localeCompare(b))
  const apiBlock = apis.length
    ? `\ndeclare global {\n${apis
        .map(([name, module]) => `  const ${name}: typeof import('${module}')['${name}']`)
        .join('\n')}\n}\n`
    : ''
  const componentBlock = components.length
    ? `\ndeclare module 'vue' {\n  interface GlobalComponents {\n${components
        .map(
          ([name, path]) =>
            `    ${name}: typeof import('${path}')['default']`,
        )
        .join('\n')}\n  }\n}\n`
    : ''

  return `/* 由 plugins/auto-import/auto-import.ts 生成，请勿手动编辑。 */\n\nexport {}\n${apiBlock}${componentBlock}`
}

export function autoImportPlugin(options: AutoImportOptions): Plugin {
  let root = process.cwd()

  return {
    name: 'lab:auto-import',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
    },

    buildStart() {
      if (!options.dts) return

      const filename = resolve(root, options.dts)
      const declarations = renderDeclarations(options)
      mkdirSync(dirname(filename), { recursive: true })
      // 仅在内容变化时写文件，避免无意义地触发 watch 与 HMR。
      if (!existsSync(filename) || readFileSync(filename, 'utf8') !== declarations) {
        writeFileSync(filename, declarations)
      }
    },

    transform(code, id) {
      if (/[?&]vue(?:[=&]|$)/.test(id)) return

      const filename = id.split('?')[0].replaceAll('\\', '/')
      if (!options.include.test(filename) || !filename.endsWith('.vue')) return

      const scriptMatch = code.match(
        /(<script\b(?=[^>]*\bsetup\b)[^>]*>)([\s\S]*?)(<\/script>)/,
      )
      if (!scriptMatch || scriptMatch.index === undefined) return

      const script = scriptMatch[2]
      const template = code.match(/<template\b[^>]*>([\s\S]*?)<\/template>/)?.[1] ?? ''
      const injected: string[] = []

      for (const [identifier, module] of Object.entries(options.imports)) {
        if (hasApiUsage(script, identifier) && !hasBinding(script, identifier)) {
          injected.push(`import { ${identifier} } from '${module}'`)
        }
      }

      for (const [component, path] of Object.entries(options.components)) {
        if (hasComponentUsage(template, component) && !hasBinding(script, component)) {
          injected.push(`import ${component} from '${path}'`)
        }
      }

      if (!injected.length) return

      const openTagEnd = scriptMatch.index + scriptMatch[1].length
      const trailingNewline = script.startsWith('\n') ? '' : '\n'
      const transformed =
        code.slice(0, openTagEnd) +
        `\n${injected.join('\n')}${trailingNewline}` +
        code.slice(openTagEnd)

      return { code: transformed, map: null }
    },
  }
}
