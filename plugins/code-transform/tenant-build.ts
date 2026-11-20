import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

interface TenantConfig {
  brand: string
  theme: string
  features: {
    betaPanel: boolean
  }
}

const tenantIds = new Set(['default', 'beta'])

export function tenantBuildPlugin(): Plugin {
  return {
    name: 'lab:tenant-build',

    config() {
      const tenantId = process.env.TENANT || 'default'
      if (!tenantIds.has(tenantId)) {
        throw new Error(`[lab:tenant-build] 未知租户 ${tenantId}；可选值：default、beta`)
      }

      const configUrl = new URL(
        `../../src/plugin-lab/fixtures/code-transform/tenants/${tenantId}.json`,
        import.meta.url,
      )
      const tenant = JSON.parse(readFileSync(configUrl, 'utf8')) as TenantConfig

      return {
        define: {
          __TENANT_ID__: JSON.stringify(tenantId),
          __TENANT_BRAND__: JSON.stringify(tenant.brand),
          __TENANT_THEME__: JSON.stringify(tenant.theme),
          __TENANT_BETA_PANEL__: JSON.stringify(tenant.features.betaPanel),
        },
      }
    },
  }
}
