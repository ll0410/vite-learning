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

    // ch06：显式声明需要预构建的依赖。
    // 好处：首个页面还没请求到它时就开始预构建，减少「二次刷新才不卡」的现象。
    optimizeDeps: {
      include: ['lodash-es', 'dayjs'],
    },

    // ch07：CSS 工程化配置
    css: {
      // 开发时在 DevTools 里能看到源码位置而不是编译后的 CSS
      devSourcemap: true,
      preprocessorOptions: {
        scss: {
          // 注入到每个 <style lang="scss"> 的最前面，省去重复 @use
          additionalData: '@use "@/styles/variables" as *;\n',
        },
      },
      // Vite 8 构建期默认用 Lightning CSS 压缩 CSS。
      // 如需调整降级目标：
      // lightningcss: { targets: { chrome: 111 << 16 } },
    },

    server: {
      port: 5173,
      strictPort: false,
      open: false,
      // ch09：HMR 默认走 dev server 同一端口，一般无需配置。
      // 需要自定义 WebSocket 时：
      // hmr: { port: 24678, overlay: true },
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    },
  }
})
