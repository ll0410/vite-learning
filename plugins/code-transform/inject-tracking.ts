// 插件示例：向带标记的 SFC 注入 onMounted 埋点，演示 Vue 编译前的源码改写。
// enforce: 'pre' 保证此处拿到原始 <script setup>，而不是编译后的模块。
import type { Plugin } from 'vite'

// 固定文件与显式标记共同限制转换范围，避免误改其他业务组件。
const targetSfc = '/src/views/plugins/categories/CodeTransformDemos.vue'
const trackingMarker = '<!-- lab:inject-tracking -->'

/**
 * 创建 SFC 埋点注入插件，仅处理带 lab:inject-tracking 标记的目标组件。
 * 它在 Vue 官方插件编译前，把 onMounted 注册代码插入原有 <script setup> 中；
 * 若没有标记或 script setup 则返回 undefined，保持模块不变。
 */
export function injectTrackingPlugin(): Plugin {
  return {
    name: 'lab:inject-tracking',
    enforce: 'pre',

    transform(code, id) {
      // 去掉 ?vue 等查询参数后匹配文件；标记检查进一步限定为带标记的原始 SFC 内容。
      const cleanId = id.split('?', 1)[0]
      if (!cleanId.endsWith(targetSfc) || !code.includes(trackingMarker)) return

      // 这里只提取完整开标签（含 lang 等属性），稍后会从开标签后开始插入代码。
      const scriptSetup = code.match(/<script\b[^>]*\bsetup\b[^>]*>/)?.[0]
      if (!scriptSetup) return

      // 注入内容以原开标签开头，因此新增 import 和生命周期代码都位于 <script setup> 内。
      const injection = `${scriptSetup}
import { onMounted as __labOnMounted } from 'vue'
import { track as __labTrack } from '@/plugin-lab/tracking'
__labOnMounted(() => {
  __labTrack('code-transform-demo-mounted')
})`

      // 注入会改变行列位置，map: null 表示不提供映射；生产场景可用 MagicString 生成 source map。
      return { code: code.replace(scriptSetup, injection), map: null }
    },
  }
}
