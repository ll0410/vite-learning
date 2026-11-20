// 插件示例：向带标记的 SFC 注入 onMounted 埋点，演示 Vue 编译前的源码改写。
// enforce: 'pre' 保证此处拿到原始 <script setup>，而不是编译后的模块。
import type { Plugin } from 'vite'

// 固定文件与显式标记共同限制转换范围，避免误改其他业务组件。
const targetSfc = '/src/views/plugins/categories/CodeTransformDemos.vue'
const trackingMarker = '<!-- lab:inject-tracking -->'

export function injectTrackingPlugin(): Plugin {
  return {
    name: 'lab:inject-tracking',
    enforce: 'pre',

    transform(code, id) {
      const cleanId = id.split('?', 1)[0]
      if (!cleanId.endsWith(targetSfc) || !code.includes(trackingMarker)) return

      const scriptSetup = code.match(/<script\b[^>]*\bsetup\b[^>]*>/)?.[0]
      if (!scriptSetup) return

      const injection = `${scriptSetup}
import { onMounted as __labOnMounted } from 'vue'
import { track as __labTrack } from '@/plugin-lab/tracking'
__labOnMounted(() => {
  __labTrack('code-transform-demo-mounted')
})`

      return { code: code.replace(scriptSetup, injection), map: null }
    },
  }
}
