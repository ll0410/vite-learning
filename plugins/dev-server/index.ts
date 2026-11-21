import type { Plugin } from 'vite'
import { mockApiPlugin } from '../mock-api.ts'
import { proxyFallbackPlugin } from './proxy-fallback.ts'
import { debugEndpointsPlugin } from './debug-endpoints.ts'
import { authUploadPlugin } from './auth-upload.ts'

/**
 * 汇总开发服务器插件，数组顺序也是 configureServer 钩子的默认执行顺序。
 * 因而同一路径由多个中间件处理时，靠前的插件先看到请求；未认领的请求应通过 next() 继续传递。
 */
export function devServerPlugins(): Plugin[] {
  return [
    mockApiPlugin(),
    proxyFallbackPlugin(),
    debugEndpointsPlugin(),
    authUploadPlugin(),
  ]
}
