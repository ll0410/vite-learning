// ch10-2：向 HTML 注入构建信息。
// 学习点：transformIndexHtml 可以返回 tags，让 Vite 负责插入位置与顺序。
import type { Plugin } from 'vite'

export function buildStampPlugin(): Plugin {
  const stamp = new Date().toISOString()

  return {
    name: 'lab:append-build-stamp',

    transformIndexHtml() {
      return {
        tags: [
          {
            tag: 'meta',
            attrs: { name: 'build-stamp', content: stamp },
            injectTo: 'head',
          },
        ],
      }
    },
  }
}
