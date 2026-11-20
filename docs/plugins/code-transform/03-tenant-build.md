# 07 多租户 / 多品牌差异化构建

> 对应源码：`plugins/code-transform/tenant-build.ts`；公开输入位于 `src/plugin-lab/fixtures/code-transform/tenants/`。

## 真实场景

同一套应用需要为不同客户生成不同品牌名、主题色和公开功能开关。本例用 `TENANT` 在 Node 构建期选择 `default.json` 或 `beta.json`，再通过 Vite `define` 把值静态内联到浏览器代码中。它是**构建时选择**，不是浏览器运行时切换租户。

所有 JSON 都是可公开教学内容。`define` 的值最终能在产物中被任何人读取，绝不能放密码、私钥、私密接口地址或服务器专用配置。

## 核心钩子与数据流

1. `config` 钩子在配置定稿前执行，读取 `process.env.TENANT`，缺省为 `default`。
2. 白名单只接受 `default`、`beta`，再把受控文件名拼入 fixture URL，避免任意路径输入。
3. Node 的 `readFileSync` 读取并解析公开 JSON；浏览器不会请求整份租户目录。
4. 返回 `define`，分别提供 `__TENANT_ID__`、`__TENANT_BRAND__`、`__TENANT_THEME__` 和 `__TENANT_BETA_PANEL__`。
5. 分类页把这些常量放入本地 `tenant` 对象，展示品牌、实际主题色块和 Beta 开关；未请求的租户值不会进入该次模块图。

`src/types/code-transform.d.ts` 声明四个全局常量，避免 TypeScript 把编译期标识符当成未定义变量。

## 最小实现与配置接入

```ts
config() {
  const tenantId = process.env.TENANT || 'default'
  // 白名单检查后读取对应 JSON
  return {
    define: {
      __TENANT_BRAND__: JSON.stringify(tenant.brand),
      __TENANT_THEME__: JSON.stringify(tenant.theme),
      __TENANT_BETA_PANEL__: JSON.stringify(tenant.features.betaPanel),
    },
  }
}
```

`JSON.stringify` 同时处理字符串引号/转义和布尔值，不能直接把裸字符串拼进 `define`。插件在 `plugins/code-transform/index.ts` 中以 `tenantBuildPlugin()` 注册，导入写作 `./tenant-build.ts`，无需修改共享配置。

## 验证步骤

### 1. dev 默认品牌

```bash
pnpm exec vite --port 5212
```

打开 <http://localhost:5212/plugins/code-transform#tenant-build>，应看到：

- `Northwind 默认教学品牌` 与租户 ID `default`；
- 主题色 `#14532d` 及对应色块；
- Beta 功能为“关闭”，不显示 Beta 专属面板。

开发服务在启动时读取租户配置；改变 `TENANT` 后应重启服务，而不是假设当前页面会运行时换肤。

### 2. 默认构建

```bash
pnpm build
node --input-type=module -e "import { readdirSync, readFileSync } from 'node:fs'; const output = readdirSync('dist/assets').filter((file) => file.endsWith('.js')).map((file) => readFileSync('dist/assets/' + file, 'utf8')).join('\n'); for (const token of ['Northwind 默认教学品牌', '#14532d']) { if (!output.includes(token)) throw new Error('默认构建缺少 ' + token); } for (const token of ['Contoso Beta 教学品牌', '#7c2d12']) { if (output.includes(token)) throw new Error('默认构建混入 ' + token); } console.log('默认租户产物断言通过');"
```

### 3. Beta 独立构建与预览

```bash
TENANT=beta pnpm build --outDir dist-beta
node --input-type=module -e "import { readdirSync, readFileSync } from 'node:fs'; const output = readdirSync('dist-beta/assets').filter((file) => file.endsWith('.js')).map((file) => readFileSync('dist-beta/assets/' + file, 'utf8')).join('\n'); for (const token of ['Contoso Beta 教学品牌', '#7c2d12']) { if (!output.includes(token)) throw new Error('Beta 构建缺少 ' + token); } for (const token of ['Northwind 默认教学品牌', '#14532d']) { if (output.includes(token)) throw new Error('Beta 构建混入 ' + token); } console.log('Beta 租户产物断言通过');"
pnpm exec vite preview --outDir dist-beta --port 4212
```

预览 Beta 页面应显示 `#7c2d12`、开启开关和 Beta 专属面板。两个独立 `outDir` 防止对照产物互相覆盖；产物目录不提交。

最后运行 `pnpm docs:build` 和 `git diff --check`。

## 生产级实现还需补齐

- 用 schema 校验 JSON 的必填字段、颜色格式和开关类型，并为未知租户提供明确发布检查。
- 将品牌资源、路由权限、服务端数据隔离和缓存键一起设计；前端 `define` 开关不能承担鉴权。
- 建立逐租户构建矩阵与产物发布映射，避免环境变量串台、HTML 缓存混用或覆盖输出目录。
- 若要求同一份产物运行时换租户，应改用受控运行时配置接口，而不是本例的静态替换。

## 常见坑

- **把秘密写进租户 JSON**：即使 tree-shaking 后暂时没看到，也不能把私密值交给前端构建。
- **字符串未经过 `JSON.stringify`**：容易生成无效 JavaScript 或被解释成标识符。
- **用布尔开关做权限控制**：用户能修改前端代码，真正的权限必须由服务端执行。
- **复用同一个 outDir 做对照**：后一次构建会覆盖前一次证据，因此使用 `dist` 与 `dist-beta`。
