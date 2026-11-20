import type { App } from 'vue'
import { setupCodeGeneration } from './code-generation'
import { setupCodeTransform } from './code-transform'
import { setupAutoImport } from './auto-import'
import { setupHtmlInjection } from './html-injection'
import { setupDevServer } from './dev-server'
import { setupBuildOutput } from './build-output'
import { setupCustomFiles } from './custom-files'
import { setupMigration } from './migration'

export function setupPluginLab(app: App) {
  const setups = [
    setupCodeGeneration,
    setupCodeTransform,
    setupAutoImport,
    setupHtmlInjection,
    setupDevServer,
    setupBuildOutput,
    setupCustomFiles,
    setupMigration,
  ]

  setups.forEach((setup) => setup(app))
}
