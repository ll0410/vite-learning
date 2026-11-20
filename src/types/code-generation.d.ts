declare module 'virtual:generated-api' {
  export interface GeneratedUser {
    id: number
    name: string
    role: string
  }

  export interface GeneratedUsersResponse {
    total: number
    users: GeneratedUser[]
  }

  export function getUsers(): Promise<GeneratedUsersResponse>
}

declare module 'virtual:generated-routes' {
  export interface GeneratedRouteRecord {
    path: string
    name: string
    title: string
  }

  const routes: GeneratedRouteRecord[]
  export default routes
}

declare module 'virtual:generated-i18n' {
  export interface GeneratedMessages {
    title: string
    greeting: string
    switchLabel: string
  }

  const messages: Record<'zh-CN' | 'en-US', GeneratedMessages>
  export default messages
}
