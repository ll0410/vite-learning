import type { PluginLabSetup } from '../types'
import components from 'virtual:auto-components'

export const setupCodeGeneration: PluginLabSetup = (app) => {
  components.forEach(({ name, component }) => app.component(name, component))
}
