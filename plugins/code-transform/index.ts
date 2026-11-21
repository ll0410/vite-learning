// 代码转换示例的统一入口：调用方可将返回数组展开到 Vite 插件配置中。
import type { Plugin } from 'vite'
import { stripDebugPlugin } from '../strip-debug.ts'
import { injectTrackingPlugin } from './inject-tracking.ts'
import { tenantBuildPlugin } from './tenant-build.ts'
import { conditionalBuildPlugin } from './conditional-build.ts'

/**
 * 创建本组插件实例。
 * 数组顺序体现注册顺序，实际执行先后还受各插件 enforce 和 Vite 钩子阶段影响。
 */
export function codeTransformPlugins(): Plugin[] {
  return [stripDebugPlugin(), injectTrackingPlugin(), tenantBuildPlugin(), conditionalBuildPlugin()]
}
