// ch03：从空配置升级为「可解释的常用配置」。
// ch04：用 loadEnv 在构建期读取环境变量。
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  // 第三个参数传 '' 表示读取所有变量（包括没有 VITE_ 前缀的）。
  // 注意：env 只在这里（Node 侧）可用，不会自动注入客户端。
  const env = loadEnv(mode, process.cwd(), '')

  console.debug(`[vite.config] command=${command}, mode=${mode}`)
  console.debug(
    `[vite.config] VITE_API_BASE=${env.VITE_API_BASE}, DB_PASSWORD=${
      env.DB_PASSWORD ? '已读取（仅构建期）' : '未设置'
    }`,
  )

  return {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      port: 5173,
      strictPort: false,
      open: false,
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    },
  }
})
