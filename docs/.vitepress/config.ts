import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import { pluginGuideSidebar } from './plugin-sidebar'

const base = process.env.GITHUB_PAGES === 'true' ? '/vite-learning/docs/' : '/'
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const repositoryUrl = 'https://github.com/ll0410/vite-learning'
const sourcePathPattern = /^(?:(?:plugins|src|docs|public)\/.*|vite\.config\.ts|package\.json|pnpm-lock\.yaml|index\.html|admin\.html)$/

export default defineConfig({
  lang: 'zh-CN',
  title: 'Vite Learning',
  description: '10 小时动手实践 Vite 8：开发链路、构建链路、插件机制与性能优化',
  base,
  lastUpdated: true,
  // 教程里的示例地址指向本地 demo 服务，构建时无需校验
  ignoreDeadLinks: [/^http:\/\/localhost/],
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '入门', link: '/guide/', activeMatch: '/guide/' },
      { text: '插件', link: '/plugins/', activeMatch: '/plugins/' },
      { text: '性能', link: '/performance/', activeMatch: '/performance/' },
      {
        text: 'GitHub',
        link: 'https://github.com/ll0410/vite-learning',
        target: '_blank',
        rel: 'noreferrer',
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [{ text: '学习路线（10 小时）', link: '/guide/' }],
        },
        {
          text: '快速入门',
          items: [
            { text: '01 Vite 概述', link: '/guide/ch01-overview' },
            { text: '02 快速开始', link: '/guide/ch02-quick-start' },
            { text: '03 默认配置与常见问题', link: '/guide/ch03-config-basics' },
            { text: '04 环境变量', link: '/guide/ch04-env' },
            { text: '05 框架加入：Vue + TypeScript', link: '/guide/ch05-vue' },
            { text: '06 依赖预构建', link: '/guide/ch06-dep-prebundle' },
            { text: '07 CSS 工程化', link: '/guide/ch07-css' },
            { text: '08 静态资源处理', link: '/guide/ch08-assets' },
            { text: '09 HMR 模块热替换', link: '/guide/ch09-hmr' },
            { text: '10 Vite 插件机制', link: '/guide/ch10-plugins' },
          ],
        },
        {
          text: '参考',
          items: [{ text: 'Vite 8 的关键变化', link: '/guide/appendix-vite8-changes' }],
        },
      ],
      '/plugins/': [
        {
          text: '插件手册',
          items: [
            { text: '学习方式', link: '/plugins/' },
            { text: '使用场景', link: '/plugins/appendix-plugin-scenarios' },
            { text: '开发必备', link: '/plugins/appendix-plugins' },
          ],
        },
        ...pluginGuideSidebar,
        {
          text: '相关章节',
          items: [{ text: '10 Vite 插件机制', link: '/guide/ch10-plugins' }],
        },
      ],
      '/performance/': [
        {
          text: '性能优化',
          items: [
            { text: '11 Code Splitting 代码分割', link: '/performance/ch11-code-splitting' },
            { text: '12 Vite 性能优化', link: '/performance/ch12-performance' },
          ],
        },
        {
          text: '相关章节',
          items: [{ text: '06 依赖预构建', link: '/guide/ch06-dep-prebundle' }],
        },
      ],
    },
    search: { provider: 'local' },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一章', next: '下一章' },
    lastUpdated: { text: '最后更新' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    footer: {
      message: '基于 Vite 8 + Vue 3 的动手学习项目',
      copyright: '仅用于学习与实践',
    },
  },
  markdown: {
    config(md) {
      const renderCodeInline = md.renderer.rules.code_inline!

      md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
        const sourcePath = tokens[idx].content
        const renderOriginal = () => renderCodeInline(tokens, idx, options, env, self)

        // 仅链接真实仓库路径，保留历史文件、通配符和 dev 请求地址的原样。
        if (!sourcePathPattern.test(sourcePath) || /[\s*?]/.test(sourcePath)) {
          return renderOriginal()
        }

        const normalizedPath = sourcePath.replace(/\/+$/, '')
        const absolutePath = resolve(repositoryRoot, normalizedPath)
        if (!existsSync(absolutePath)) return renderOriginal()

        const linkType = statSync(absolutePath).isDirectory() ? 'tree' : 'blob'
        const encodedPath = normalizedPath.split('/').map(encodeURIComponent).join('/')
        const href = `${repositoryUrl}/${linkType}/main/${encodedPath}`
        return `<a href="${href}" target="_blank" rel="noreferrer">${renderOriginal()}</a>`
      }
    },
  },
  vite: {
    server: { port: 5174 },
  },
})
