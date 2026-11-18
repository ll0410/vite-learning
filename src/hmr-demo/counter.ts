// ch09：手写 HMR 边界。
// 这个模块「自己接受自己」的更新：修改它时不会整页刷新，状态也能保留。

interface CounterState {
  count: number
}

// 从上一版模块的 dispose 里拿到状态；首次加载时为 undefined
const previous = import.meta.hot?.data as { state?: CounterState } | undefined
const state: CounterState = previous?.state ?? { count: 0 }

// 新模块重新执行时，DOM 节点仍然存在，所以这里能直接找到它
let el: HTMLElement | null = document.querySelector('[data-hmr-counter]')

function render() {
  if (!el) return
  el.textContent = `手写 HMR 计数器：${state.count}（+1 后修改本文件，数值会保留）`
}

export function mountCounter(target: HTMLElement) {
  el = target
  // 用 onclick 而不是 addEventListener，避免热更新后重复绑定
  target.onclick = () => {
    state.count += 1
    render()
  }
  render()
}

if (import.meta.hot) {
  // 声明「本模块可以自我更新」，否则更新会向上冒泡到入口导致整页刷新
  import.meta.hot.accept((newModule) => {
    if (el) newModule?.mountCounter(el)
    console.debug('[hmr] counter.ts 已自我更新')
  })

  // 模块即将被替换时，把状态交给下一版
  import.meta.hot.dispose((data) => {
    data.state = state
  })

  import.meta.hot.on('vite:beforeUpdate', (payload) => {
    console.debug('[hmr] beforeUpdate', payload.updates.map((u) => u.path))
  })
}
