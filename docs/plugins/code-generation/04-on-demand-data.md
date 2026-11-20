# 大体积静态数据按需导出

## 真实场景

图标路径、字典或离线词库可能包含成千上万条记录。直接 `import data from './dictionary.json'`，再读取其中一个 key，会把整份 JSON 放进模块图，最终是否裁剪也依赖打包器和数据结构。本例把**数据集和键名编码进虚拟模块 ID**，每个 `load` 只返回被请求的值。

示例从 `icons.json` 请求 `rocket`、`book`，从 `dictionary.json` 请求 `vite`、`plugin`。源文件另外包含 `UNUSED_ICON_SENTINEL_DO_NOT_BUNDLE` 和 `UNUSED_DICTIONARY_SENTINEL_DO_NOT_BUNDLE`，用于证明未请求内容没有进入浏览器产物。

## 核心钩子与数据流

- `resolveId` 识别 `virtual:on-demand-data/` 前缀，并保留完整数据集/key 路径，加上 `\0`。
- `load` 从内部 ID 解析出 `dataset` 和 `key`，只允许 `icons`、`dictionary` 两个白名单数据集。
- 插件读取对应 JSON，检查 key 必须存在，最后只对 `data[key]` 做 `JSON.stringify` 并生成默认导出；源对象本身不作为模块导出。
- `this.addWatchFile` 关联数据文件。dev 下数据变化时，插件只失效已经请求过且依赖该文件的虚拟模块，再整页刷新。

```text
virtual:on-demand-data/icons/rocket
  → parse dataset=icons, key=rocket
  → icons.json[key]
  → export default "M14 4c3-2…"
```

## 最小实现

```ts
resolveId(id) {
  if (id.startsWith('virtual:on-demand-data/')) return '\0' + id
}

load(id) {
  if (!id.startsWith('\0virtual:on-demand-data/')) return
  const { dataset, key } = parseRequest(id)
  const data = JSON.parse(readFileSync(datasetFile(dataset), 'utf-8'))
  if (!Object.hasOwn(data, key)) throw new Error(`Unknown key: ${dataset}/${key}`)
  return `export default ${JSON.stringify(data[key])}`
}
```

调用方显式声明所需条目：

```ts
import rocketPath from 'virtual:on-demand-data/icons/rocket'
import viteDefinition from 'virtual:on-demand-data/dictionary/vite'
```

`src/types/code-generation.d.ts` 使用 `virtual:on-demand-data/*` 通配声明；本例两个数据集的导出值都为字符串，因此声明保持为 `string`。

## 配置接入

`plugins/code-generation/index.ts` 将 `onDemandDataPlugin()` 加入本类数组。示例和 fixture 都位于本分类目录，未新增依赖，也未在其他模块直接导入完整 JSON，避免绕过按需边界。

## 验证步骤

1. 运行 `pnpm exec vite --port 5211`，访问 `http://localhost:5211/plugin-lab/code-generation#on-demand-data`，确认两个 SVG 图标和两个词条正常显示。
2. 打开 Inspect 搜索 `virtual:on-demand-data`，逐个检查四个模块的 `load` 结果。也可请求其中一个：

   ```bash
   curl http://localhost:5211/@id/__x00__virtual:on-demand-data/icons/rocket
   curl http://localhost:5211/@id/__x00__virtual:on-demand-data/dictionary/vite
   ```

   响应只能包含对应路径或定义，不能包含另一个 key 或任何 `UNUSED_*_SENTINEL_DO_NOT_BUNDLE`。
3. 运行 `pnpm build`，然后检查所有生产 JS：

   ```bash
   ! grep -R "UNUSED_ICON_SENTINEL_DO_NOT_BUNDLE" dist/assets
   ! grep -R "UNUSED_DICTIONARY_SENTINEL_DO_NOT_BUNDLE" dist/assets
   ```

   同时确认请求的 SVG 路径和词条文本存在。`.gz`、`.br` 是压缩副本，文本断言应以未压缩 `.js` 为准。
4. 在 Inspect 中确认数据集/key 是不同模块，而不是一个包含完整对象的聚合模块。

## 生产级实现还需补齐

- 用 schema 校验数据集和值类型，并限制 key 字符集，防止把虚拟 ID 变成任意文件读取入口；本例使用固定数据集和受控 key。
- 大规模动态选择应设计清晰的键枚举、异步加载、缓存和错误状态，并避免为海量 key 无节制地创建模块。
- 按数据集、路由或业务域规划 chunk，结合压缩、内容哈希和 CDN 缓存评估真实收益；逐 key 拆模块并不总是比少量分桶更优。
- 数据中的秘密不会因为 tree-shaking 而变得安全。只有公开数据才能进入构建输入，访问控制必须在服务端完成。

## 常见坑

- **只裁剪最终导出，不检查模块内容**：应在 Inspect 的 `load` 阶段就确保完整对象没有进入浏览器模块，而不只依赖生产压缩器。
- **另一处直接导入原 JSON**：这会重新把整份数据拉入模块图，使按需虚拟模块失去意义。
- **忘记校验 key**：缺失 key 会生成 `undefined` 或让路径解析越界；本例通过白名单和 `Object.hasOwn` 给出明确错误。
- **用压缩文件做文本断言**：二进制 `.gz`、`.br` 不能直接搜索字符串，应检查原始 JS。
- **虚拟 ID 不规则**：斜杠、查询参数和编码需要明确约定；本例只接受 `dataset/key` 两段，不支持任意嵌套 key。

可对照 [第 1 项的聚合生成](./01-generated-modules.md)，理解“聚合成一个模块”和“按请求拆成多个模块”的不同数据边界。
