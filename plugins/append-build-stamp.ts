// ch10-2：向 HTML 注入构建信息。
// 学习点：transformIndexHtml 可以返回 tags，让 Vite 负责插入位置与顺序。
import type { Plugin } from 'vite'

/**
 * 创建 HTML 构建信息插件，在页面 <head> 中追加构建时间戳 meta 标签。
 * 时间戳在创建插件实例时固定，同一次运行中的多次 HTML 转换会复用该值。
 *
 * 输出示例：<meta name="build-stamp" content="2026-01-01T00:00:00.000Z">。
 */
export function buildStampPlugin(): Plugin {
  const stamp = new Date().toISOString()

  return {
    name: 'lab:append-build-stamp',

    // 该钩子在开发服务器输出 HTML 前及生产构建生成 HTML 时执行。
    // 返回 tags 描述让 Vite 负责插入细节，无需自行拼接或替换整段 HTML。
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
