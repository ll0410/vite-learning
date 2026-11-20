import type { Plugin } from 'vite'

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
