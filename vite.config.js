// ch03：从空配置升级为「可解释的常用配置」。
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// 函数式配置：可以拿到 command（serve/build）与 mode（development/production/staging...）
export default defineConfig(({ command, mode }) => {
  console.debug(`[vite.config] command=${command}, mode=${mode}`)

  return {
    // 别名：把 @ 指向 src。注意：这里必须用绝对路径。
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      port: 5173,
      // 端口被占用时自动换端口；设为 true 则直接报错
      strictPort: false,
      open: false,
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // 多页应用时在这里加 input，本章只在文档里演示：
      // rolldownOptions: { input: { main: 'index.html', admin: 'admin.html' } },
    },
  }
})
