import type { Plugin } from 'vite'
import { injectScripts } from './inject-scripts.ts'
import { injectHeadAssets } from './inject-head-assets.ts'
import { mpaEntry } from './mpa-entry.ts'
import { preconnect } from './preconnect.ts'

/**
 * 汇总 HTML 转换插件；数组顺序也是 transformIndexHtml 钩子的默认执行顺序。
 * 前一个插件返回的 html 会交给后一个插件，各插件声明的 tags 则由 Vite 汇总并注入最终页面。
 */
export function htmlInjectionPlugins(): Plugin[] {
  return [injectScripts(), injectHeadAssets(), mpaEntry(), preconnect()]
}
