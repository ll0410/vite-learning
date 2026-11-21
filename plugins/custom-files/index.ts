import type { Plugin } from 'vite'
import { customFileTypesPlugin } from './custom-file-types.ts'

/** 返回自定义文件转换示例的插件列表，供 Vite 配置统一注册。 */
export function customFilePlugins(): Plugin[] {
  return [customFileTypesPlugin()]
}
