// ch05：接入 Vue。配置从 .js 迁移到 .ts，并注册 @vitejs/plugin-vue。
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  console.debug(`[vite.config] command=${command}, mode=${mode}`)
  console.debug(
    `[vite.config] VITE_API_BASE=${env.VITE_API_BASE}, DB_PASSWORD=${
      env.DB_PASSWORD ? '已读取（仅构建期）' : '未设置'
    }`,
  )

  return {
    plugins: [vue()],

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
