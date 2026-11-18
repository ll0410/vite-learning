// ch09：这个模块没有 accept，也没有任何上层模块接受它，
// 所以修改它 → 更新冒泡到入口 main.ts → 浏览器整页刷新。
export const bootNote = 'no-accept.ts 已加载（修改这个文件会整页刷新）'

console.debug('[hmr] no-accept.ts executed:', bootNote)
