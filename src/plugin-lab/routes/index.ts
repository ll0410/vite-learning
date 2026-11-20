import type { RouteRecordRaw } from 'vue-router'
import { codeGenerationRoutes } from './code-generation'
import { codeTransformRoutes } from './code-transform'
import { autoImportRoutes } from './auto-import'
import { htmlInjectionRoutes } from './html-injection'
import { devServerRoutes } from './dev-server'
import { buildOutputRoutes } from './build-output'
import { customFileRoutes } from './custom-files'
import { migrationRoutes } from './migration'

export const pluginLabRoutes: RouteRecordRaw[] = [
  ...codeGenerationRoutes,
  ...codeTransformRoutes,
  ...autoImportRoutes,
  ...htmlInjectionRoutes,
  ...devServerRoutes,
  ...buildOutputRoutes,
  ...customFileRoutes,
  ...migrationRoutes,
]
