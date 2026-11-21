// 插件示例：按 TENANT 读取租户配置，并通过 define 注入编译期常量。
// config 钩子会在启动与构建时执行，非法租户应在配置合并前立即报错。
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

/**
 * 创建租户构建插件，从 TENANT 环境变量选择配置，并通过 define 声明编译期常量。
 * 例如 TENANT=beta 时，源码中的 __TENANT_ID__ 会被替换为字符串字面量 "beta"。
 * 这些标识符由打包器静态替换，不是在浏览器中读取 process.env，也不会自动挂到 window。
 */
export function tenantBuildPlugin(): Plugin {
  return {
    name: 'lab:tenant-build',

    // config 在最终配置解析前运行，返回片段会由 Vite 合并；未知租户直接终止启动或构建。
    config() {
      const tenantId = process.env.TENANT || 'default'
      if (!tenantIds.has(tenantId)) {
        throw new Error(`[lab:tenant-build] 未知租户 ${tenantId}；可选值：default、beta`)
      }

      // 以当前插件文件为基准定位 JSON，避免依赖执行命令时的工作目录。
      const configUrl = new URL(
        `../../src/plugin-lab/fixtures/code-transform/tenants/${tenantId}.json`,
        import.meta.url,
      )
      // 配置在 Node.js 侧读取，最终只把 define 中声明的值注入客户端代码。
      const tenant = JSON.parse(readFileSync(configUrl, 'utf8')) as TenantConfig

      return {
        // define 接收代码表达式，字符串必须序列化以保留运行时所需的引号。
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
