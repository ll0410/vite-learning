import type { Plugin } from 'vite'
import { mockApiPlugin } from '../mock-api.ts'

export function devServerPlugins(): Plugin[] {
  return [mockApiPlugin()]
}
