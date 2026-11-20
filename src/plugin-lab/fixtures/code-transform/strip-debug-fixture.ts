// 只供 strip-debug 教学断言使用；dev 中保留全部语句。
console.log('STRIP_DEBUG_CONSOLE_SENTINEL')
debugger // STRIP_DEBUG_DEBUGGER_SENTINEL

// test-only:start
console.warn('STRIP_DEBUG_TEST_ONLY_SENTINEL')
// test-only:end

export const stripDebugDevSentinel = 'STRIP_DEBUG_DEV_SENTINEL'
Object.assign(globalThis, { stripDebugDevSentinel })
