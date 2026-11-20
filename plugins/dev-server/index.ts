import type { Plugin } from 'vite'
import { mockApiPlugin } from '../mock-api.ts'
import { proxyFallbackPlugin } from './proxy-fallback.ts'
import { debugEndpointsPlugin } from './debug-endpoints.ts'

export function devServerPlugins(): Plugin[] {
  return [mockApiPlugin(), proxyFallbackPlugin(), debugEndpointsPlugin()]
}
