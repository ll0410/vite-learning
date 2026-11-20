declare module '*.md' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

declare module '*.graphql' {
  export const document: string
  export const operationName: string | null

  const graphql: {
    document: string
    operationName: string | null
  }
  export default graphql
}

declare module '*.csv' {
  export const headers: string[]
  export const rows: Array<Record<string, string>>
  export default rows
}
