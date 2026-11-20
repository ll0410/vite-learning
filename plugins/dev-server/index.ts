import type { Plugin } from 'vite'
import { mockApiPlugin } from '../mock-api.ts'
import { proxyFallbackPlugin } from './proxy-fallback.ts'

export function devServerPlugins(): Plugin[] {
  return [mockApiPlugin(), proxyFallbackPlugin()]
}
