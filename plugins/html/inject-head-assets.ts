// 插件示例：注入 Report-Only CSP、主题样式和首屏骨架，而不修改原始 index.html。
// 学习点：transformIndexHtml 可同时返回改写后的 html 与待插入的 head 标签。
import type { HtmlTagDescriptor, Plugin } from 'vite'

// Report-Only 只报告不拦截，避免教学 CSP 阻断 Vite dev 与 HMR 所需资源。
const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const skeletonMarkup = [
  '<div id="plugin-lab-skeleton" data-html-injection="skeleton" role="status" aria-label="页面加载中">',
  '<div class="plugin-lab-skeleton-title"></div>',
  '<div class="plugin-lab-skeleton-line"></div>',
  '<div class="plugin-lab-skeleton-line"></div>',
  '</div>',
].join('')

const headTags: HtmlTagDescriptor[] = [
  {
    tag: 'meta',
    attrs: {
      'http-equiv': 'Content-Security-Policy-Report-Only',
      content: reportOnlyCsp,
      'data-html-injection': 'csp',
    },
    injectTo: 'head',
  },
  {
    tag: 'style',
    attrs: { 'data-html-injection': 'theme' },
    children: `
      :root {
        --plugin-lab-accent: #6d28d9;
        --plugin-lab-accent-surface: #f5f3ff;
      }
      #plugin-lab-skeleton {
        margin: 24px;
        padding: 20px;
        border-radius: 12px;
        background: var(--plugin-lab-accent-surface);
        animation: plugin-lab-skeleton-pulse 1s ease-in-out infinite alternate;
      }
      .plugin-lab-skeleton-title,
      .plugin-lab-skeleton-line {
        height: 14px;
        margin-top: 12px;
        border-radius: 6px;
        background: #ddd6fe;
      }
      .plugin-lab-skeleton-title {
        width: 45%;
        height: 22px;
        margin-top: 0;
      }
      .plugin-lab-skeleton-line:last-child { width: 70%; }
      @keyframes plugin-lab-skeleton-pulse {
        from { opacity: 0.55; }
        to { opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        #plugin-lab-skeleton { animation: none; }
      }
    `,
    injectTo: 'head',
  },
]

/**
 * 创建 HTML 增强插件，加入 Report-Only CSP、内联主题样式和应用挂载前的首屏骨架。
 * 转换只作用于内存中的 HTML 或构建产物，不会回写项目里的 index.html 源文件。
 */
export function injectHeadAssets(): Plugin {
  return {
    name: 'plugin-lab:inject-head-assets',
    // dev 与 build 都会执行该钩子：html 字段负责字符串替换，tags 字段由 Vite 按注入点序列化。
    transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
      return {
        // 骨架先放入挂载点，Vue 挂载后会替换它。
        html: html.replace(
          '<div id="app"></div>',
          `<div id="app">${skeletonMarkup}</div>`,
        ),
        tags: headTags,
      }
    },
  }
}
