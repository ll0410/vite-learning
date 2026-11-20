import type { HtmlTagDescriptor, Plugin } from 'vite'

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

export function injectHeadAssets(): Plugin {
  return {
    name: 'plugin-lab:inject-head-assets',
    transformIndexHtml(html): { html: string; tags: HtmlTagDescriptor[] } {
      return {
        html: html.replace(
          '<div id="app"></div>',
          `<div id="app">${skeletonMarkup}</div>`,
        ),
        tags: headTags,
      }
    },
  }
}
