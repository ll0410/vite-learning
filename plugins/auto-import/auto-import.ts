// 插件示例：在 Vue SFC 的 <script setup> 中按需补齐 API 与组件导入。
// 学习点：enforce: 'pre' 让源码扫描早于 Vue 编译，buildStart 同步生成类型声明。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * include 限定参与转换的文件；imports 配置“API 名 -> 模块”，components 配置“组件名 -> 路径”。
 * dts 是可选的类型声明输出路径（相对于项目根目录），只帮助编辑器与类型检查，不参与运行时导入。
 */
export interface AutoImportOptions {
  include: RegExp
  imports: Record<string, string>
  components: Record<string, string>
  dts?: string
}

/** 转义标识符中的正则特殊字符，确保后续按字面名称构造匹配规则。 */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 教学版用正则避免重复导入；复杂项目应改用 AST，排除注释、字符串等误匹配。
/** 检查脚本中是否已有同名声明或导入；已有绑定时不能再次注入。 */
function hasBinding(script: string, identifier: string) {
  const name = escapeRegExp(identifier)
  const declaration = new RegExp(`\\b(?:const|let|var|function|class)\\s+${name}\\b`)
  const imported = new RegExp(
    `^[\\t ]*import\\s+[^\\n]*\\b${name}\\b[^\\n]*\\s+from\\s*['"]`,
    'm',
  )

  return declaration.test(script) || imported.test(script)
}

/**
 * 检查脚本是否使用了独立的 API 标识符，例如匹配 ref()，但不匹配 obj.ref() 或 myRef。
 * 输入为 <script setup> 的文本，输出仅表示是否发现使用，不修改源码。
 */
function hasApiUsage(script: string, identifier: string) {
  const name = escapeRegExp(identifier)
  return new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(script)
}

/** 按模板开始标签检测组件用法，并确保标签名后紧跟空白、斜杠或 >。 */
function hasComponentUsage(template: string, component: string) {
  return new RegExp(`<${escapeRegExp(component)}(?=[\\s/>])`).test(template)
}

/**
 * 根据配置生成 .d.ts 文本：API 放入 declare global，组件加入 Vue 的 GlobalComponents。
 * 排序让输出稳定；这些声明描述自动导入后的类型环境，本身不会生成运行时代码。
 */
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

/**
 * 创建 Vue SFC 自动导入插件。
 * enforce: 'pre' 使 transform 在 @vitejs/plugin-vue 编译前看到原始 SFC，直接向
 * <script setup> 开头插入缺失的 import；buildStart 则同步生成编辑器所需的声明文件。
 */
export function autoImportPlugin(options: AutoImportOptions): Plugin {
  let root = process.cwd()

  return {
    name: 'lab:auto-import',
    enforce: 'pre',

    // 配置解析后保存真实项目根目录，避免 dts 的相对路径受进程启动目录影响。
    configResolved(config) {
      root = config.root
    },

    // buildStart 在开发服务器初始化和正式构建开始时执行，适合准备项目级生成文件。
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

    // transform 的 code 是模块当前源码，id 是模块 ID；返回 undefined 表示无需转换。
    // Vue 插件还会为 SFC 子块生成带 ?vue 的 ID，这里只处理主模块，避免重复注入。
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
      // 分别扫描脚本中的 API 和模板中的组件，把确实缺失的导入收集后一次性插入。
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

      // 只有实际注入时才返回新源码；map: null 表示教学示例不额外生成转换 source map。
      return { code: transformed, map: null }
    },
  }
}
