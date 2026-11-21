import type { Plugin } from 'vite'
import { appInfoPlugin } from '../virtual-app-info.ts'
import { generatedModulesPlugin } from './generated-modules.ts'
import { autoDiscoveryPlugin } from './auto-discovery.ts'
import { onDemandDataPlugin } from './on-demand-data.ts'

/** 汇总代码生成示例插件，供 Vite 配置统一注册；每次调用都会创建新的插件实例。 */
export function codeGenerationPlugins(): Plugin[] {
  return [generatedModulesPlugin(), autoDiscoveryPlugin(), onDemandDataPlugin(), appInfoPlugin()]
}
