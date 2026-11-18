// ch05：Vue 应用入口。
// ch07：引入全局样式。
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'

createApp(App).use(router).mount('#app')
