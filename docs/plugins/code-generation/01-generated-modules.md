# 自动生成 API 客户端、路由表、i18n 资源聚合

## 真实场景

团队已经有一份受控的接口、页面或翻译描述时，重复手写客户端函数、路由数据和语言包聚合容易产生遗漏。本例用三个虚拟模块展示同一条数据流：**磁盘输入 → 插件读取 → 生成 ESM → 应用像普通模块一样导入**。

本例源码是 `plugins/code-generation/generated-modules.ts`，输入位于 `src/plugin-lab/fixtures/codegen/`。它生成的是路由**记录数据**，不会把路由注册进 Vue Router；真实目录约定式路由见本类第 3 项。

## 核心钩子与数据流

- `resolveId`：识别 `virtual:generated-api`、`virtual:generated-routes` 和 `virtual:generated-i18n`，返回带 `\0` 前缀的内部 ID，避免其他插件把它当作磁盘路径。
- `load`：读取对应 JSON，分别生成 `fetch` 函数、路由数组和中英文资源对象；`this.addWatchFile` 把输入纳入模块监听关系。
- `configureServer`：监听输入的 `add`、`change`、`unlink`，只失效依赖该输入的虚拟模块，并发送 `full-reload`，让下一次 `load` 读到新内容。

请求链路如下：

```text
CodeGenerationDemos.vue
  ├─ virtual:generated-api   ← api.json
  ├─ virtual:generated-routes ← routes.json
  └─ virtual:generated-i18n   ← locales/*.json
```

## 最小实现

每个虚拟模块都由公开 ID 和内部 ID 组成：

```ts
const API_ID = 'virtual:generated-api'
const RESOLVED_API_ID = '\0' + API_ID

resolveId(id) {
  if (id === API_ID) return RESOLVED_API_ID
},
load(id) {
  if (id === RESOLVED_API_ID) {
    return `export const getUsers = () => request("/api/mock/users", { method: "GET" })`
  }
}
```

实际插件在生成函数名前校验标识符，并使用 `JSON.stringify` 序列化 JSON 中的路径、方法和资源值，避免字符串拼接破坏 ESM。生成的 `request` 负责检查 `response.ok`，因此调用方可以统一处理 HTTP 错误。

## 配置接入

`plugins/code-generation/index.ts` 将 `generatedModulesPlugin()` 加入本类插件数组，共享 `vite.config.ts` 已展开该数组，无需再改入口配置：

```ts
export function codeGenerationPlugins(): Plugin[] {
  return [generatedModulesPlugin(), appInfoPlugin()]
}
```

`src/types/code-generation.d.ts` 声明三个模块的导出类型；`src/plugin-lab/routes/code-generation.ts` 提供 `/plugin-lab/code-generation` 示例页。示例路由避开根目录 `/plugins` 的同名源码目录，防止 dev 静态中间件把目录 `index.ts` 当作页面响应。

## 验证步骤

1. 运行 `pnpm exec vite --port 5211`，访问 `http://localhost:5211/plugin-lab/code-generation#generated-modules`。
2. 确认用户列表来自生成的 `getUsers()`，路由表有两条数据，按钮可切换中英文。
3. 打开 `http://localhost:5211/__inspect/`，搜索三个 `virtual:generated-*` 模块，查看 `resolveId` 和 `load` 结果。
4. 修改 `src/plugin-lab/fixtures/codegen/locales/zh-CN.json` 的 `greeting`，确认页面刷新并显示新值，验证后恢复文件。
5. 运行 `pnpm build` 和 `pnpm docs:build`，确认虚拟模块可被生产构建解析且声明满足示例使用。

也可以直接检查 dev 模块响应：

```bash
curl http://localhost:5211/@id/__x00__virtual:generated-api
curl http://localhost:5211/@id/__x00__virtual:generated-routes
curl http://localhost:5211/@id/__x00__virtual:generated-i18n
```

## 生产级实现还需补齐

- 用 OpenAPI/JSON Schema 等可信描述生成请求参数、响应和错误类型，并处理查询参数、请求体、鉴权、取消请求及运行时数据校验。
- 对描述文件做 schema 校验、跨文件冲突检测和诊断定位；本例只接受受控 JSON，不是通用代码生成器。
- 大型语言包需要按 locale 或命名空间拆包、异步加载及缺失 key 回退；本例为了观察聚合结果，将两份小语言包放在同一模块。
- 若要生成类型声明，应把声明输出纳入明确的构建流程，而不是依赖手写声明与描述长期保持同步。

## 常见坑

- **漏掉 `\0`**：其他插件或 Node 解析可能继续处理虚拟 ID，得到错误的路径结果。
- **只 watch、不失效**：Vite 可能继续使用模块图中的旧 `load` 结果；文件事件和模块失效缺一不可。
- **把路由数据当作真实路由**：导出数组不会自动调用 `createRouter`，本类第 3 项才负责实际接入。
- **生成代码未序列化**：直接插入描述字符串容易遇到引号、换行或非法标识符，至少应使用 `JSON.stringify` 并校验名称。

继续回顾 [ch10 虚拟模块基础](../../guide/ch10-plugins.md)。
