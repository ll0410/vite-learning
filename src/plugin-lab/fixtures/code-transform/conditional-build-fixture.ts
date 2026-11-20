// dev 中占位符仍是字符串，比较表达式让公开布尔开关默认为 false。
export const conditionalBuildPublicConfig = Object.freeze({
  apiOrigin: '__LAB_PUBLIC_API_ORIGIN__',
  labsEnabled: '__LAB_PUBLIC_LABS_ENABLED__' === 'true',
})
Object.assign(globalThis, { conditionalBuildPublicConfig })

// DEV_ONLY:start
Object.assign(globalThis, {
  conditionalBuildDevOnlySentinel: 'CONDITIONAL_BUILD_DEV_ONLY_SENTINEL',
})
// DEV_ONLY:end
