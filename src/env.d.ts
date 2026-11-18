/// <reference types="vite/client" />

// ch04：给 import.meta.env 上的自定义变量补类型。
// 在 JS 项目里它主要用于编辑器提示；ch05 接入 TS 后会真正参与类型检查。
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
