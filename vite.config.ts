// ch05：接入 Vue。配置从 .js 迁移到 .ts，并注册 @vitejs/plugin-vue。
// ch10：注册四个本地插件 + vite-plugin-inspect。
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import inspect from 'vite-plugin-inspect'
import { visualizer } from 'rollup-plugin-visualizer'
import { compression } from 'vite-plugin-compression2'
import { appInfoPlugin } from './plugins/virtual-app-info'
import { buildStampPlugin } from './plugins/append-build-stamp'
import { mockApiPlugin } from './plugins/mock-api'
import { stripDebugPlugin } from './plugins/strip-debug'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  console.debug(`[vite.config] command=${command}, mode=${mode}`)
  console.debug(
    `[vite.config] VITE_API_BASE=${env.VITE_API_BASE}, DB_PASSWORD=${env.DB_PASSWORD ? '已读取（仅构建期）' : '未设置'
    }`,
  )

  return {
    plugins: [
      vue(),
      appInfoPlugin(),
      buildStampPlugin(),
      mockApiPlugin(),
      stripDebugPlugin(),
      // 可视化插件管线：dev 下访问 /__inspect/
      inspect(),
      // ch12：只有在 ANALYZE=true 时才生成产物分析报告（pnpm build:analyze）
      ...(process.env.ANALYZE === 'true'
        ? [
          visualizer({
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
        : []),
      // ch12：构建时额外产出 .gz / .br，便于对比服务端压缩后的体积
      compression({
        algorithms: ['gzip', 'brotliCompress'],
        threshold: 1024,
      }),
    ],

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
      // ch12：启动时预热首屏模块，减少「第一次打开很慢」
      warmup: {
        clientFiles: ['./src/main.ts', './src/App.vue', './src/views/Home.vue'],
      },
      // ch09：HMR 默认走 dev server 同一端口，一般无需配置。
      // 需要自定义 WebSocket 时：
      // hmr: { port: 24678, overlay: true },
    },
    devtools: {
      clientAuth: false,
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // ch12：构建性能与体积相关的开关
      reportCompressedSize: true, // 终端输出 gzip 体积
      sourcemap: false, // 生产默认关闭；排查线上问题时可临时开
      // assetsInlineLimit: 4096, // 小资源内联阈值（ch08）
      // target: 'baseline-widely-available', // Vite 8 默认值
      // cssMinify: 'lightningcss', // Vite 8 默认值
      // ch11：代码分割。Vite 8 使用 Rolldown 的 codeSplitting；
      // 旧的 output.manualChunks 对象写法在 Vite 8 已被移除。
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-vue',
                test: /node_modules[\\/](vue|vue-router|@vue)[\\/]/,
              },
              {
                name: 'vendor-utils',
                test: /node_modules[\\/](lodash-es|dayjs)[\\/]/,
              },
            ],
          },
        },
      },
    },
  }
})
