// 插件示例：构建时注册 index/admin 多入口，并注入各入口独立的标题和 meta。
// 学习点：config 修改 rolldownOptions.input，transformIndexHtml 用 context.filename 区分入口。
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HtmlTagDescriptor, Plugin } from 'vite'

const entryAssets = {
  index: {
    label: 'main',
    title: 'Vite 插件实验室 · Main SPA',
  },
  admin: {
    label: 'admin',
    title: 'Vite 插件实验室 · Admin',
  },
} as const

/**
 * 创建多页应用插件：构建时注册 index/admin 两个 HTML 输入，转换时注入各自标题和 meta。
 * config 在配置解析前运行，可通过 command 区分 serve 与 build，并返回待合并的配置片段。
 */
export function mpaEntry(): Plugin {
  return {
    name: 'plugin-lab:mpa-entry',
    config(_config, { command }) {
      // dev 可直接访问各个 HTML 文件，只有构建需要显式声明多入口。
      if (command !== 'build') return

      return {
        build: {
          rolldownOptions: {
            // 对象键是入口名；import.meta.url 用于定位当前源码附近的 HTML，避免依赖进程启动目录。
            input: {
              index: fileURLToPath(new URL('../../index.html', import.meta.url)),
              admin: fileURLToPath(new URL('../../admin.html', import.meta.url)),
            },
          },
        },
      }
    },
    // 同一钩子会分别处理每个 HTML 入口；context.filename 是当前 HTML 文件路径，不是浏览器请求 URL。
    transformIndexHtml(html, context): { html: string; tags: HtmlTagDescriptor[] } {
      const entryName = basename(context.filename) === 'admin.html' ? 'admin' : 'index'
      const entry = entryAssets[entryName]

      return {
        // 先移除模板旧 title，再通过 tags 添加新标题，避免同一文档出现两个 title；新标签都插入 head。
        html: html.replace(/\s*<title>[^<]*<\/title>/, ''),
        tags: [
          {
            tag: 'meta',
            attrs: {
              name: 'plugin-lab-entry',
              content: entry.label,
              'data-html-injection': 'entry-meta',
            },
            injectTo: 'head',
          },
          {
            tag: 'title',
            attrs: {
              'data-html-injection': 'entry-title',
              'data-entry': entry.label,
            },
            children: entry.title,
            injectTo: 'head',
          },
        ],
      }
    },
  }
}
