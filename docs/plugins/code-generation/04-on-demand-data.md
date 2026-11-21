# 大体积静态数据按需导出

图标路径、字典或离线词库可能包含成千上万条记录。直接 `import data from './dictionary.json'`，再读取其中一个键名（key），会把整份 JSON 作为模块输入；最终能删掉多少未使用内容，还取决于打包器和数据结构。

本例换一种边界：**业务代码把数据集和 key 写进模块 ID，插件每次只生成一个值的默认导出。**示例只请求 `rocket`、`book` 两个图标和 `vite`、`plugin` 两个词条；源 JSON 中特意保留两个未请求的哨兵字符串，用来检查它们是否混入模块源码或生产 JS。

## 先看懂：插件在做什么

一句话概括：**JSON 文件是数据源，带数据集和 key 的虚拟模块是单项数据的生成边界，页面拿到的仍然是普通字符串。**

这里的“模块 ID”就是 `import` 后面用于定位模块的字符串，例如 `virtual:on-demand-data/dictionary/vite`。“虚拟模块”则指磁盘上没有这个 ID 对应的文件，模块源码由 Vite 插件在加载时生成。Vite 会把入口及各级 import 依赖组织成“模块图”，也就是应用模块之间的依赖关系集合。

```text
src/plugin-lab/fixtures/codegen/
├─ icons.json
└─ dictionary.json
        ↓ 按模块 ID 中的 dataset/key 读取单项
四个独立的虚拟模块
├─ virtual:on-demand-data/icons/rocket
├─ virtual:on-demand-data/icons/book
├─ virtual:on-demand-data/dictionary/vite
└─ virtual:on-demand-data/dictionary/plugin
        ↓ 每个模块只默认导出一个字符串
CodeGenerationDemos.vue
├─ 把图标路径传给 SVG 的 <path d="...">
└─ 把词条定义渲染到 <dd>
        ↓ 生产构建
请求的四个值进入页面产物，未请求的哨兵不应出现
```

**这里的“按需”是模块生成时按 key 提供数据，不是浏览器运行到某行代码时再查询 JSON。**四个 `import` 都是静态导入，会随示例页面一起加载；生产构建还可能把它们内联或合并到同一个页面 chunk。chunk 是构建器输出的文件分块，和源码中的模块不是一一对应关系。

插件优化的也是交给浏览器的模块内容，而不是磁盘读取量：当前实现仍会在 Node.js 侧读取并解析整份 JSON。

## 第一个完整示例：从 `dictionary/vite` 到页面词条

### 1. 输入：一份 JSON 和一条明确的 import

`src/plugin-lab/fixtures/codegen/dictionary.json` 的完整内容如下。fixture 是示例使用的固定输入数据：

```json
{
  "vite": "Vite 通过原生 ESM 提供开发服务，并在生产构建中生成优化产物。",
  "plugin": "插件通过解析、加载和转换等钩子扩展模块管线。",
  "unused-heavy-entry": "UNUSED_DICTIONARY_SENTINEL_DO_NOT_BUNDLE"
}
```

`src/views/plugins/categories/CodeGenerationDemos.vue` 没有导入这份 JSON，而是导入一个带数据集和 key 的虚拟模块：

```ts
import viteDefinition from 'virtual:on-demand-data/dictionary/vite'
```

这条 import 同时表达了“使用哪个数据集”和“只取哪个 key”：`dictionary` 是数据集，`vite` 是键名。

### 2. 生成：模块源码中只有被请求的定义

Vite 的 `load` 是加载钩子，负责返回模块源码。本例执行到 `dictionary/vite` 时，`load` 返回的完整源码是：

```ts
export default "Vite 通过原生 ESM 提供开发服务，并在生产构建中生成优化产物。"
```

这里不是先导出整个 `data` 对象，再寄希望于生产压缩器删除其他字段。`plugin` 和 `unused-heavy-entry` 从一开始就不在这个模块的 `load` 结果中。

真实源码最后只有这一行生成逻辑：

```ts
return `export default ${JSON.stringify(data[key])}`
```

`JSON.stringify` 会把字符串转成带引号、正确转义的 JavaScript 字符串字面量，不能直接把原始文本拼到 `export default` 后面。

### 3. 消费：像使用普通字符串一样组成列表

页面还导入了第二个词条，然后把两个字符串放进普通数组：

```ts
import viteDefinition from 'virtual:on-demand-data/dictionary/vite'
import pluginDefinition from 'virtual:on-demand-data/dictionary/plugin'

const dictionaryEntries = [
  { key: 'vite', definition: viteDefinition },
  { key: 'plugin', definition: pluginDefinition },
]
```

模板遍历这个数组，并通过 <code v-pre>&lt;dd&gt;{{ entry.definition }}&lt;/dd&gt;</code> 显示定义。消费者不需要知道 JSON 的路径，也没有拿到可以遍历整个词库的对象。

`src/types/code-generation.d.ts` 用通配声明覆盖这类动态模块 ID：

```ts
declare module 'virtual:on-demand-data/*' {
  const value: string
  export default value
}
```

这与当前两个数据集的值都为字符串相符；如果以后允许对象或数组，类型声明和运行时校验都要同步调整。

### 4. 结果：两个词条可见，未请求词条不进入模块结果

示例页面会显示：

- `dictionary/vite`：Vite 通过原生 ESM 提供开发服务，并在生产构建中生成优化产物。
- `dictionary/plugin`：插件通过解析、加载和转换等钩子扩展模块管线。

与此同时，`UNUSED_DICTIONARY_SENTINEL_DO_NOT_BUNDLE` 不应出现在任何一个按需模块的 `load` 结果中，也不应出现在生产环境的未压缩 JS 中。页面正常显示只能证明消费者拿到了所需字符串，不能证明未请求内容已被排除；后一点需要按后文的验证步骤检查模块和产物。

## 同一份图标数据为什么能拆成两个模块

`src/plugin-lab/fixtures/codegen/icons.json` 也遵循同样规则：

```json
{
  "rocket": "M14 4c3-2 6-2 6-2s0 3-2 6l-6 6-4-4 6-6ZM8 10l-4 2 3 2 3-2M12 14l-2 6-2-3 2-3M5 19c1-2 3-2 4 0-1 1-3 1-4 0Z",
  "book": "M4 5c4-1 6 0 8 2v13c-2-2-4-3-8-2V5Zm16 0c-4-1-6 0-8 2v13c2-2 4-3 8-2V5Z",
  "unused-heavy-icon": "UNUSED_ICON_SENTINEL_DO_NOT_BUNDLE"
}
```

下面两个由业务 import 使用的公共模块 ID 不同，所以它们是两个模块，而不是同一个 `icons` 聚合对象上的两次属性访问：

```ts
import rocketPath from 'virtual:on-demand-data/icons/rocket'
import bookPath from 'virtual:on-demand-data/icons/book'
```

以 `rocket` 为例，`load` 返回：

```ts
export default "M14 4c3-2 6-2 6-2s0 3-2 6l-6 6-4-4 6-6ZM8 10l-4 2 3 2 3-2M12 14l-2 6-2-3 2-3M5 19c1-2 3-2 4 0-1 1-3 1-4 0Z"
```

页面将两个默认导出组装为 `iconEntries`，再把每项的 `path` 传给真实的 SVG 元素：

```ts
const iconEntries = [
  { key: 'rocket', label: '火箭', path: rocketPath },
  { key: 'book', label: '文档', path: bookPath },
]
```

```vue
<path :d="icon.path" />
```

最终页面显示“火箭”和“文档”两个 SVG 图标。`unused-heavy-icon` 没有被 import，因此不会生成对应模块，其哨兵字符串也不应出现在其他图标模块中。

## 虚拟模块是怎样按 key 生成的

看完输入和结果，再回头看 `plugins/code-generation/on-demand-data.ts` 中的钩子：

- `configResolved`：在 Vite 配置解析完成后保存项目根目录 `root`，供 `datasetFile` 定位真实 JSON。
- `resolveId`：解析钩子，认领以 `virtual:on-demand-data/` 开头的模块 ID，并返回带 `\0` 的内部 ID。
- `load`：从内部 ID 解析数据集和 key，读取对应 JSON，检查 key 后生成默认导出。
- `configureServer`：只在开发服务器中注册数据文件监听，处理后续修改。

`resolveId` 返回的 `\0` 是 Rollup/Vite 虚拟模块的内部标识约定，可以避免其他插件把它当作普通文件路径继续处理。例如：

```text
业务代码：virtual:on-demand-data/dictionary/vite
内部 ID：\0virtual:on-demand-data/dictionary/vite
```

**业务代码始终不写 `\0`。**浏览器开发请求中的 `__x00__` 则是这个内部前缀在 URL 中的表示。

下面保留 `resolveId` 和 `load` 的真实逻辑，仅省略源码注释：

```ts
resolveId(id) {
  if (id.startsWith(VIRTUAL_PREFIX)) return `\0${id}`
},

load(id) {
  if (!id.startsWith(RESOLVED_PREFIX)) return

  const { dataset, key } = parseRequest(id.slice(RESOLVED_PREFIX.length))
  const file = datasetFile(dataset)
  const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, string>
  if (!Object.hasOwn(data, key)) {
    throw new Error(`Unknown on-demand data key: ${dataset}/${key}`)
  }

  this.addWatchFile(file)
  requestedFiles.set(id, file)
  return `export default ${JSON.stringify(data[key])}`
},
```

各辅助函数和常量在这段流程中的职责如下：

| 源码名称 | 实际行为 | 对 `dictionary/vite` 的结果 |
| --- | --- | --- |
| `VIRTUAL_PREFIX` | 固定为 `virtual:on-demand-data/` | 匹配公共 import |
| `RESOLVED_PREFIX` | 在公共前缀前加 `\0` | 匹配内部 ID |
| `parseRequest` | 按 `/` 拆成 `dataset`、`key`、`extra`，拒绝非法请求 | 得到 `dataset = 'dictionary'`、`key = 'vite'` |
| `DATASETS` | 只允许 `['icons', 'dictionary']` | `dictionary` 通过白名单 |
| `datasetFile` | 拼接 `src/plugin-lab/fixtures/codegen/${dataset}.json` | 定位 `dictionary.json` |
| `Object.hasOwn` | 要求 key 必须是 JSON 对象自身的属性 | `vite` 存在，继续生成 |

`parseRequest` 只接受 `dataset/key` 两段。数据集不受支持、缺少 key 或出现额外路径段时，会抛出 `Invalid on-demand data request: ...`；数据集合法但 key 不存在时，则抛出 `Unknown on-demand data key: ...`。这两类错误都不会静默生成 `export default undefined`。

`this.addWatchFile(file)` 把真实数据文件登记为模块依赖；`requestedFiles.set(id, file)` 则记录“内部模块 ID → 数据文件”的反向索引，供开发期精确找到受影响模块。

## 开发时：数据变化后怎样更新

`load` 只负责生成当前内容。数据文件随后发生变化时，还需要让旧模块失效，否则 Vite 可能继续使用缓存的源码。

本例的更新过程是：

1. `configureServer` 启动时把 `icons.json` 和 `dictionary.json` 都加入 `server.watcher`。
2. 每次 `load` 都通过 `requestedFiles` 记录当前内部模块 ID 依赖哪个文件。
3. watcher 收到 `add`、`change` 或 `unlink` 后，`invalidateDataset` 只遍历已经加载过、且依赖当前文件的模块。
4. 对找到的模块调用 `server.moduleGraph.invalidateModule(module)`，也就是丢弃旧模块缓存，让下次请求重新执行 `load`。
5. 只要实际失效了模块，就发送 `full-reload`，让页面重新加载并使用新值。

例如修改 `dictionary.json` 时，已经加载的 `dictionary/vite` 和 `dictionary/plugin` 会被失效，`icons/rocket` 和 `icons/book` 不属于这个文件的反向索引，不会因这次文件事件被单独失效。

但要注意：**精确失效不等于局部页面更新。**本例随后触发的是整页刷新，不是只替换某个 `<dd>` 的局部热更新。若文件变化时没有任何已加载模块依赖它，`invalidated` 保持为 `false`，插件不会主动整页刷新。

生产构建没有开发服务器的这套 `configureServer` 流程；`load` 中的 `this.addWatchFile` 仍会把数据文件登记为构建依赖，供监听模式等构建流程跟踪。

## 项目接入与页面路由

这条示例链路已经接好，不需要新增依赖：

| 位置 | 接入内容 | 作用 |
| --- | --- | --- |
| `plugins/code-generation/index.ts` | 在 `codeGenerationPlugins()` 返回数组中调用 `onDemandDataPlugin()` | 创建本插件实例 |
| `vite.config.ts` | 在 `plugins` 中展开 `...codeGenerationPlugins()` | 把实例注册进 Vite |
| `src/types/code-generation.d.ts` | 声明 `virtual:on-demand-data/*` 默认导出 `string` | 让 TypeScript 理解动态虚拟模块 |
| `src/plugin-lab/routes/code-generation.ts` | 注册 `/plugin-lab/code-generation`，动态导入 `CodeGenerationDemos.vue` | 提供示例页面 |
| `src/plugin-lab/catalog/code-generation.ts` | 将 demo 指向 `/plugin-lab/code-generation#on-demand-data` | 从实验目录定位到本示例 |

注册数组中的真实顺序是：

```ts
return [generatedModulesPlugin(), autoDiscoveryPlugin(), onDemandDataPlugin(), appInfoPlugin()]
```

示例路由的真实记录是：

```ts
{
  path: '/plugin-lab/code-generation',
  name: 'plugin-code-generation',
  component: () => import('@/views/plugins/categories/CodeGenerationDemos.vue'),
}
```

`src/plugin-lab/routes/index.ts` 会展开 `codeGenerationRoutes`，`src/router/index.ts` 再把 `pluginLabRoutes` 放在 404 路由之前。页面中的 `<section id="on-demand-data">` 与 URL 中 `#` 后的锚点对应，因此访问示例链接会直接定位到本节。

项目没有在其他业务模块中直接导入这两份完整 JSON。这一点很重要：绕过虚拟模块直接导入原文件，会重新把整份数据拉入模块图。

## 验证步骤

### 1. 检查页面消费结果

运行：

```bash
pnpm exec vite --port 5211
```

访问 `http://localhost:5211/plugin-lab/code-generation#on-demand-data`。

预期结果：

- “只请求 rocket 与 book 图标”区域显示“火箭”和“文档”两个 SVG 图标。
- “只请求两个词条”区域显示 `dictionary/vite` 和 `dictionary/plugin`，文本与前文 JSON 完全一致。
- 页面不显示 `unused-heavy-icon` 或 `unused-heavy-entry`；但这只是页面检查，不能替代下面的模块与产物检查。

### 2. 检查每个 `load` 的生成边界

打开 `http://localhost:5211/__inspect/`（Vite 模块检查页面），搜索 `virtual:on-demand-data`，应看到 `icons/rocket`、`icons/book`、`dictionary/vite`、`dictionary/plugin` 四个独立模块，而不是一个导出完整数据对象的聚合模块。

也可以直接请求其中两个：

```bash
curl http://localhost:5211/@id/__x00__virtual:on-demand-data/icons/rocket
curl http://localhost:5211/@id/__x00__virtual:on-demand-data/dictionary/vite
```

预期结果：响应的核心源码分别是前文展示的 `rocket` 路径和 `vite` 定义。每个响应只含自己请求的字符串，不含同文件的另一个 key，也不含任何 `UNUSED_*_SENTINEL_DO_NOT_BUNDLE`。再检查另外两个模块，应分别只有 `book` 路径和 `plugin` 定义。

### 3. 检查数据文件更新

在保持开发服务器运行时，临时修改 `dictionary.json` 中 `vite` 的定义。

预期结果：依赖 `dictionary.json` 的已加载虚拟模块被失效，随后页面整页刷新，`dictionary/vite` 显示新文本；Inspect 中重新查看该模块，`load` 结果也应是新值。检查完成后恢复原内容，临时验证修改不要提交。

### 4. 检查生产构建结果

运行：

```bash
pnpm build
```

先确认两个未请求哨兵不存在：

```bash
! grep -R --include='*.js' "UNUSED_ICON_SENTINEL_DO_NOT_BUNDLE" dist/assets
! grep -R --include='*.js' "UNUSED_DICTIONARY_SENTINEL_DO_NOT_BUNDLE" dist/assets
```

预期结果：两条命令都没有匹配输出，并因前面的 `!` 将“未找到”转换为命令成功。

再分别搜索四个请求值的特征文本：

```bash
grep -R --include='*.js' "M14 4c3-2" dist/assets
grep -R --include='*.js' "M4 5c4-1" dist/assets
grep -R --include='*.js' "Vite 通过原生 ESM 提供开发服务" dist/assets
grep -R --include='*.js' "插件通过解析、加载和转换等钩子扩展模块管线" dist/assets
```

预期结果：四次搜索都能在至少一个未压缩 `.js` 文件中找到对应内容。项目会额外生成 `.gz`、`.br` 压缩副本，所以这里用 `--include='*.js'` 限定文本断言，不对二进制压缩文件做字符串搜索。

最后运行 `pnpm exec vite preview --port 5311`，访问 `http://localhost:5311/plugin-lab/code-generation#on-demand-data`。预期两个图标和两个词条仍正常显示。**不要用“是否恰好生成四个 JS chunk”判断按需导出是否成功；生产构建可以内联字符串或合并模块。**

## 进阶参考

::: details 生产级实现还需补齐

- 用 schema（对数据结构和值类型的约束）校验 JSON，并限制 key 字符集。当前白名单只固定数据集路径，key 不参与文件路径拼接；若未来支持更自由的路径，必须额外防止利用 `..` 等路径段逃出预期目录，避免任意文件读取。
- 当前静态 import 适合构建时就能确定的 key。大规模动态选择需要设计键枚举、动态导入、缓存、加载中和错误状态，并避免为海量 key 无节制地创建模块；受变量控制的动态 import 仍受打包器静态分析限制，不能靠运行时任意拼接模块 ID 来加载任意 key。
- 本例每个 `load` 都同步执行 `readFileSync` 和 `JSON.parse`。真实大数据集可以缓存解析结果，并在文件变化时同步清理缓存，避免同一文件按 key 重复读取解析，同时保证更新不会继续返回旧值。
- 按数据集、路由或业务域规划 chunk，结合压缩、内容哈希和 CDN（内容分发网络）缓存评估真实收益；逐 key 拆模块并不总是比少量分桶更优，过多细粒度模块还可能增加模块图和请求管理成本。
- tree-shaking 指构建器删除未被使用的导出，它不是安全机制。秘密不会因为最终产物暂时没有搜索到就变得安全；只有公开数据才能进入前端构建输入，访问控制必须在服务端完成。
- 通用图标或词典需求还应评估成熟的数据分包与按需加载方案，不要只凭模块数量判断性能收益。

:::

::: details 常见坑

- **页面能显示，就以为没有完整对象进入模块图**：页面只读取一个字符串，并不能证明 `load` 没生成完整对象。必须在 Inspect 的 `load` 阶段检查生成源码，再检查生产 JS。
- **另一处直接导入原 JSON**：这会重新把整份数据拉入模块图，使按需虚拟模块失去边界；本例业务代码只导入四个虚拟模块。
- **忘记校验数据集和 key**：非法路径格式由 `parseRequest` 拒绝，缺失 key 由 `Object.hasOwn` 拒绝。去掉这些检查，可能生成意外模块或让路径约定失去保护。
- **省略 `JSON.stringify`**：直接拼接字符串会丢失引号和转义，轻则生成无效 JavaScript，重则把数据内容解释成代码。
- **把“按 key 生成模块”理解为“运行时按 key 请求接口”**：本例四个 import 都是静态模块依赖，数据在构建/开发服务器中生成，不是浏览器向 JSON 服务发起四次按需查询。
- **把模块数量当成 chunk 数量**：开发环境下的四个虚拟模块，生产时可以被合并或内联；验收重点是未请求内容不存在，而不是文件数量。
- **只登记文件监听，不失效旧模块**：`this.addWatchFile` 建立依赖关系，开发期还需 `invalidateModule` 丢弃旧生成结果；本例再通过 `full-reload` 让页面使用新值。
- **用压缩文件做文本断言**：`.gz`、`.br` 是二进制副本，应只搜索未压缩 `.js`。
- **默认支持任意嵌套 key 或查询参数**：当前 `parseRequest` 只接受 `dataset/key` 两段，斜杠、查询参数和 URL 编码都需要另行设计，不能直接套用到嵌套 key。

:::

可对照 [第 1 项的聚合生成](./01-generated-modules.md)，理解“聚合成一个模块”和“按请求拆成多个模块”的不同数据边界；插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
