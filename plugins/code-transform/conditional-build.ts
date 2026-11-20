import type { Plugin } from 'vite'

const targetModule = '/src/plugin-lab/fixtures/code-transform/conditional-build-fixture.ts'

export function conditionalBuildPlugin(): Plugin {
  return {
    name: 'lab:conditional-build',
    apply: 'build',
    enforce: 'pre',

    transform(code, id) {
      const cleanId = id.split('?', 1)[0]
      if (!cleanId.endsWith(targetModule)) return

      let inDevOnlyBlock = false
      const withoutDevOnly = code
        .split('\n')
        .filter((line) => {
          if (/^\s*\/\/\s*DEV_ONLY:start\s*$/.test(line)) {
            inDevOnlyBlock = true
            return false
          }
          if (/^\s*\/\/\s*DEV_ONLY:end\s*$/.test(line)) {
            inDevOnlyBlock = false
            return false
          }
          return !inDevOnlyBlock
        })
        .join('\n')

      const transformed = withoutDevOnly
        .replaceAll('__LAB_PUBLIC_API_ORIGIN__', 'https://public-api.example.com')
        .replaceAll('__LAB_PUBLIC_LABS_ENABLED__', 'true')

      return { code: transformed, map: null }
    },
  }
}
