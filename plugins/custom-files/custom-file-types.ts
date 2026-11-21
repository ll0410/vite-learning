// 插件示例：仅转换受控 fixture 目录中的 Markdown、GraphQL 和 CSV。
// Markdown 包装为虚拟 .vue 主模块后交给 Vue 插件，其余类型直接转换为 JS 数据导出。
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// 以当前模块 URL 定位受控目录，避免结果依赖进程工作目录；目录外的同名文件不会被转换。
const FIXTURE_ROOT = fileURLToPath(
  new URL('../../src/plugin-lab/fixtures/custom-files/', import.meta.url),
)

/** 去掉 Vite 模块 ID 的查询参数，例如将 file.vue?vue&type=script 还原为文件路径。 */
function withoutQuery(id: string) {
  return id.split('?', 1)[0]!
}

/**
 * 判断模块 ID 是否指向 fixture 内的受控文件，可同时校验可选扩展名。
 * relative 的结果用于排除 .. 越界路径和绝对路径，避免转换 fixture 之外的文件。
 */
function isControlledFile(id: string, extension?: '.md' | '.graphql' | '.csv') {
  const file = withoutQuery(id)
  if (extension && !file.endsWith(extension)) return false

  const path = relative(FIXTURE_ROOT, file)
  return path.length > 0 && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '{': '&#123;',
  '}': '&#125;',
}

// 同时转义 Vue 插值定界符，避免 Markdown 文本进入 SFC 后被当成表达式。
function escapeHtml(value: string) {
  return value.replace(/[&<>"'{}]/g, (character) => ESCAPES[character]!)
}

// 仅支持一至三级标题、段落、无序列表和围栏代码块；所有原始行内标记都按文本处理。
/**
 * 输入 Markdown 原文，输出只含 <template> 的 Vue SFC 源码字符串。
 * 此函数不直接编译模板，后续由 @vitejs/plugin-vue 接管编译。
 */
function markdownToSfc(source: string) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  // paragraph 与 codeLines 暂存跨行内容，inList/inCode 记录当前所处的块级结构。
  let paragraph: string[] = []
  let codeLines: string[] = []
  let inList = false
  let inCode = false

  const flushParagraph = () => {
    if (!paragraph.length) return
    output.push(`    <p>${escapeHtml(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const closeList = () => {
    if (!inList) return
    output.push('    </ul>')
    inList = false
  }

  for (const line of lines) {
    if (inCode) {
      if (/^```\s*$/.test(line)) {
        output.push(`    <pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
        inCode = false
      } else {
        codeLines.push(line)
      }
      continue
    }

    if (/^```[\w-]*\s*$/.test(line)) {
      flushParagraph()
      closeList()
      inCode = true
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      closeList()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1]!.length
      output.push(`    <h${level}>${escapeHtml(heading[2]!)}</h${level}>`)
      continue
    }

    const listItem = line.match(/^[-*]\s+(.+)$/)
    if (listItem) {
      flushParagraph()
      if (!inList) {
        output.push('    <ul>')
        inList = true
      }
      output.push(`      <li>${escapeHtml(listItem[1]!)}</li>`)
      continue
    }

    closeList()
    paragraph.push(line.trim())
  }

  if (inCode) throw new Error('[lab:custom-file-types] Markdown 代码围栏未闭合')
  flushParagraph()
  closeList()

  return [
    '<template>',
    '  <article class="markdown-body">',
    ...output,
    '  </article>',
    '</template>',
    '',
  ].join('\n')
}

// 逐字符解析以支持引号内的逗号、换行，以及双引号转义。
/**
 * 输入 CSV 原文，输出 { headers, rows }，其中 rows 是以表头为键的对象数组。
 * 例如 name,age\nAda,36 会得到 headers: ['name', 'age']、rows: [{ name: 'Ada', age: '36' }]。
 * 所有单元格都保留为字符串，格式不合法时抛出带插件名的错误。
 */
function parseCsv(source: string) {
  const input = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // quoteClosed 用于识别闭合引号后的非法字符，例如 "value"suffix。
  let quoteClosed = false

  const finishRow = () => {
    row.push(field)
    records.push(row)
    row = []
    field = ''
    quoteClosed = false
  }

  for (let index = 0; index < input.length; index++) {
    const character = input[index]!

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index++
        } else {
          inQuotes = false
          quoteClosed = true
        }
      } else {
        field += character
      }
      continue
    }

    if (quoteClosed && character !== ',' && character !== '\n') {
      throw new Error('[lab:custom-file-types] CSV 闭合引号后只能出现逗号或换行')
    }

    if (character === '"') {
      if (field) throw new Error('[lab:custom-file-types] CSV 引号必须从字段开头出现')
      inQuotes = true
    } else if (character === ',') {
      row.push(field)
      field = ''
      quoteClosed = false
    } else if (character === '\n') {
      finishRow()
    } else {
      field += character
    }
  }

  if (inQuotes) throw new Error('[lab:custom-file-types] CSV 引号未闭合')
  if (field || row.length || quoteClosed) finishRow()
  if (!records.length) throw new Error('[lab:custom-file-types] CSV 不能为空')

  const headers = records[0]!
  if (headers.some((header) => !header)) {
    throw new Error('[lab:custom-file-types] CSV 表头不能为空')
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('[lab:custom-file-types] CSV 表头不能重复')
  }

  const rows = records.slice(1).map((values) => {
    if (values.length !== headers.length) {
      throw new Error('[lab:custom-file-types] CSV 数据行的列数必须与表头一致')
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]!]))
  })

  return { headers, rows }
}

/**
 * 创建受控文件转换插件：
 * - Markdown 经 resolveId/load 包装成虚拟 .vue 主模块，再交给 Vue 插件编译。
 * - GraphQL 与 CSV 经 transform 转成带命名导出和默认导出的 JavaScript 模块。
 * - handleHotUpdate 把真实文件变化映射回这些派生模块，并触发整页刷新。
 */
export function customFileTypesPlugin(): Plugin {
  return {
    name: 'lab:custom-file-types',
    // 必须早于 Vite alias，否则 @/ 开头的 .md 导入会先被 alias 直接解析。
    enforce: 'pre',

    // resolveId 接收 import 的来源路径和引用方，输出供后续 load 使用的模块 ID。
    async resolveId(source, importer) {
      const queryIndex = source.indexOf('?')
      const request = queryIndex === -1 ? source : source.slice(0, queryIndex)
      const query = queryIndex === -1 ? '' : source.slice(queryIndex)

      // dev 导入会带 ?import；raw/url 等显式查询仍走 Vite 自己的资源处理。
      if (!request.endsWith('.md') || (query && query !== '?import')) return
      // skipSelf 防止递归调用当前钩子，同时复用 Vite 的别名与普通文件路径解析。
      const resolved = await this.resolve(request, importer, { skipSelf: true })
      if (!resolved || !isControlledFile(resolved.id, '.md')) return

      // 虚拟 .vue 后缀让现有 @vitejs/plugin-vue 接管 load 返回的 SFC。
      return { id: `${resolved.id}.vue${query}` }
    },

    // load 读取真实 .md 文件，却为 .md.vue 这个合成 ID 返回 SFC 源码。
    // 带 ?vue 的请求属于 Vue 插件拆出的子块，必须交还给 Vue 插件处理。
    async load(id) {
      const file = withoutQuery(id)
      const query = id.includes('?') ? new URLSearchParams(id.slice(id.indexOf('?') + 1)) : null
      if (!file.endsWith('.md.vue') || query?.has('vue')) return
      const markdownFile = file.slice(0, -'.vue'.length)
      if (!isControlledFile(markdownFile, '.md')) return

      this.addWatchFile(markdownFile)
      const source = await readFile(markdownFile, 'utf8')
      return { code: markdownToSfc(source), map: null }
    },

    // transform 在文件加载后把原始文本替换为 ESM 源码；map: null 表示不生成 source map。
    // 带查询参数的专用请求（如 ?raw、?url）保留给 Vite 默认管线处理。
    transform(code, id) {
      if (id.includes('?')) return

      if (isControlledFile(id, '.graphql')) {
        const operationName =
          code.match(/\b(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/)?.[1] ?? null
        return {
          code: [
            `export const document = ${JSON.stringify(code)};`,
            `export const operationName = ${JSON.stringify(operationName)};`,
            'export default { document, operationName };',
          ].join('\n'),
          map: null,
        }
      }

      if (isControlledFile(id, '.csv')) {
        const { headers, rows } = parseCsv(code)
        return {
          code: [
            `export const headers = ${JSON.stringify(headers)};`,
            `export const rows = ${JSON.stringify(rows)};`,
            'export default rows;',
          ].join('\n'),
          map: null,
        }
      }
    },

    // handleHotUpdate 在开发期文件变化后执行，可调整 Vite 默认计算出的 HMR 更新范围。
    handleHotUpdate({ file, server, modules }) {
      if (!isControlledFile(file)) return

      const affected = new Set(modules)
      if (file.endsWith('.md')) {
        // Markdown 的模块图节点登记在合成 .vue 文件下，需额外并入才能一起失效。
        const vueModules = server.moduleGraph.getModulesByFile(`${file}.vue`)
        vueModules?.forEach((module) => affected.add(module))
      }
      affected.forEach((module) => server.moduleGraph.invalidateModule(module))

      // 教学示例统一整页刷新，避免把 SFC 重载与数据模块边界混在一起。
      server.ws.send({ type: 'full-reload', path: '*' })
      // 返回扩展后的模块集合，让 Vite 按这个范围继续完成热更新后续处理。
      return [...affected]
    },
  }
}
