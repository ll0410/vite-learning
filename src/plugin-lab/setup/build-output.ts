import type { PluginLabSetup } from '../types'
import { publicOriginFixture } from '../../../plugins/build-output/fixtures/public-origin'

export const setupBuildOutput: PluginLabSetup = () => {
  // 让 fixture 进入 dev 与 build 的模块图：dev 保留占位符，build 由插件替换。
  const target = window as Window & { __LAB_PUBLIC_ORIGIN__?: string }
  target.__LAB_PUBLIC_ORIGIN__ = publicOriginFixture
}
