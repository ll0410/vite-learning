// ch10：为虚拟模块补类型，编辑器才认识 'virtual:app-info'
declare module 'virtual:app-info' {
  const info: {
    name: string
    version: string
    vite: string
    builtAt: string
  }
  export default info
}
