import type { Plugin } from 'vite'
import { stripDebugPlugin } from '../strip-debug.ts'
import { injectTrackingPlugin } from './inject-tracking.ts'
import { tenantBuildPlugin } from './tenant-build.ts'
import { conditionalBuildPlugin } from './conditional-build.ts'

export function codeTransformPlugins(): Plugin[] {
  return [stripDebugPlugin(), injectTrackingPlugin(), tenantBuildPlugin(), conditionalBuildPlugin()]
}
