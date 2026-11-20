# 编译期常量：版本号、构建时间、Git commit、环境标识

## 真实场景

问题排查时，仅知道应用名称通常不够，还需要确认部署的是哪个版本、哪次构建、哪个 Git 提交以及哪个 Vite mode。本例增强已有的 `plugins/virtual-app-info.ts`，把 `name`、`version`、`vite`、`builtAt`、`gitCommit` 和 `mode` 集中由 `virtual:app-info` 导出，Home 原有示例保持可用。

## 核心钩子与数据流

- 插件工厂执行时记录一次 `builtAt`，因此一次 dev 进程或一次 build 内的导入共享同一个时间戳。
- `configResolved` 从最终 Vite 配置读取 `config.mode`，并以 `config.root` 为工作目录执行 `git rev-parse --short HEAD`。
- `load` 读取 `package.json`，将上述值与 Vite 版本一起序列化为默认导出的 ESM 对象。
- 浏览器只消费生成结果，不执行 Git，也不通过 `Date.now()` 冒充构建时间。

```text
package.json ───────┐
configResolved.mode ─┼─→ load → virtual:app-info → Home / 分类示例页
git rev-parse ──────┤
插件创建时的 builtAt ┘
```

## 最小实现

```ts
const builtAt = new Date().toISOString()
let gitCommit = 'unavailable'
let mode = ''

configResolved(config) {
  mode = config.mode
  gitCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: config.root,
    encoding: 'utf-8',
  }).trim()
}

return `export default ${JSON.stringify({ builtAt, gitCommit, mode })}`
```

实际源码保留了读取失败时的 `unavailable` 回退，从不含 `.git` 的源码包构建也能保留其他版本信息。`src/types/plugins.d.ts` 同步声明新增字段，避免虚拟模块退化为 `any`。

## 配置接入

`appInfoPlugin()` 已在 `plugins/code-generation/index.ts` 中注册，共享配置会展开本类插件数组。本项没有新增插件或修改 `vite.config.ts`，也没有更改 Home 的导入方式：

```ts
import appInfo from 'virtual:app-info'

console.log(appInfo.version, appInfo.gitCommit, appInfo.mode)
```

## 验证步骤

1. 运行 `pnpm exec vite --port 5211`，访问 `http://localhost:5211/plugin-lab/code-generation#build-constants`，确认六个字段全部展示。
2. 执行 `git rev-parse --short HEAD`，再请求 dev 虚拟模块，核对 `gitCommit` 一致、`mode` 为 `development`：

   ```bash
   git rev-parse --short HEAD
   curl http://localhost:5211/@id/__x00__virtual:app-info
   ```

3. 记录首次响应中的 `builtAt`，刷新浏览器；它应保持为本次 dev 进程启动时的值，而不是每次浏览器刷新的当前时间。
4. 运行 `pnpm build`，检查生成 JS 中的 `mode` 为 `production`，并确认 Git 值与构建时的 `HEAD` 一致。也可运行 `pnpm build:staging` 验证自定义 mode 为 `staging`。
5. 打开 Inspect 搜索 `virtual:app-info`，对比 `load` 结果和分类页展示。

## 生产级实现还需补齐

- CI 中建议同时注入不可变镜像 digest、流水线编号和完整 commit，并建立构建元数据与发布记录的对应关系。
- 如果部署来自源码压缩包，应在打包前写入版本文件；没有 Git 仓库时 `unavailable` 不能替代正式版本标识。
- 对可复现构建，应由 CI 显式提供 `SOURCE_DATE_EPOCH` 等时间来源，而不是直接使用构建机器时间。
- 只注入公开元数据。秘密环境变量绝不能因为“编译期常量”机制而被序列化进浏览器模块。

## 常见坑

- **在浏览器里取时间**：这只能表示页面打开时间，不能定位构建产物。
- **使用错误的 mode**：`configResolved` 得到的是本次最终配置；不要硬编码 `production`，也不要把 `NODE_ENV` 与 Vite mode 混为一谈。
- **构建后 Git 值看似落后一个提交**：构建记录的是执行构建时的 `HEAD`；如果先构建再提交源码，产物自然记录父提交。发布流程应在源码提交固定后构建。
- **每个模块重复读 Git**：元数据应统一生成，避免多个模块出现不一致的提交或时间。

本例是在 [ch10 虚拟模块](../../guide/ch10-plugins.md) 上的增量增强；输入文件驱动的代码生成见 [第 1 项](./01-generated-modules.md)。
