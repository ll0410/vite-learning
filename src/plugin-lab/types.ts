import type { App } from 'vue'

export interface PluginLabItem {
  id: string
  title: string
  guide: string
  demo?: string
  buildOnly?: boolean
  verify: string
}

export interface PluginLabCategory {
  id: string
  title: string
  items: PluginLabItem[]
}

export type PluginLabSetup = (app: App) => void
