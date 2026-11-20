import type { Plugin } from 'vite'
import { customFileTypesPlugin } from './custom-file-types.ts'

export function customFilePlugins(): Plugin[] {
  return [customFileTypesPlugin()]
}
