import type { Plugin } from 'vite'
import { stripDebugPlugin } from '../strip-debug.ts'

export function codeTransformPlugins(): Plugin[] {
  return [stripDebugPlugin()]
}
