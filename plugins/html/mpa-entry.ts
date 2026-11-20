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

export function mpaEntry(): Plugin {
  return {
    name: 'plugin-lab:mpa-entry',
    config(_config, { command }) {
      if (command !== 'build') return

      return {
        build: {
          rolldownOptions: {
            input: {
              index: fileURLToPath(new URL('../../index.html', import.meta.url)),
              admin: fileURLToPath(new URL('../../admin.html', import.meta.url)),
            },
          },
        },
      }
    },
    transformIndexHtml(html, context): { html: string; tags: HtmlTagDescriptor[] } {
      const entryName = basename(context.filename) === 'admin.html' ? 'admin' : 'index'
      const entry = entryAssets[entryName]

      return {
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
