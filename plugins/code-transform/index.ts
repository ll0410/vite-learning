import type { Plugin } from 'vite'
import { stripDebugPlugin } from '../strip-debug.ts'
import { injectTrackingPlugin } from './inject-tracking.ts'

export function codeTransformPlugins(): Plugin[] {
  return [stripDebugPlugin(), injectTrackingPlugin()]
}
