// ch05：Vue 应用入口。
// ch07：引入全局样式。
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { bootNote } from './hmr-demo/no-accept'
import { setupPluginLab } from './plugin-lab/setup'
import './styles/main.css'

console.debug('[boot]', bootNote)

const app = createApp(App)
app.use(router)
setupPluginLab(app)
app.mount('#app')
