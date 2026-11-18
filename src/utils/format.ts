// ch06：依赖预构建的观察对象。
// - lodash-es：纯 ESM，但内部有几百个小文件（不预构建会产生大量请求）
// - dayjs：CJS 入口（不预构建浏览器无法直接 import）
import dayjs from 'dayjs'
import { kebabCase, orderBy } from 'lodash-es'

export function formatDate(input: string | number | Date): string {
  return dayjs(input).format('YYYY-MM-DD HH:mm')
}

export function slugify(text: string): string {
  return kebabCase(text)
}

export function topByScore<T>(items: T[], score: (item: T) => number, count = 3): T[] {
  return orderBy(items, score, 'desc').slice(0, count)
}
