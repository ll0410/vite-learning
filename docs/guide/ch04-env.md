# ch04 环境变量（预计 60 分钟）

## 本章目标

1. 说清 Vite 加载 `.env` 文件的顺序与覆盖规则。
2. 正确使用 `VITE_` 前缀，并知道为什么不能把密钥放进去。
3. 会在 `vite.config` 里用 `loadEnv` 读取「不进客户端」的变量。
4. 能用 `--mode` 切换 staging / production，并验证产物里的值确实变了。

## 前置

完成 ch03。

## 一、Vite 只暴露 `VITE_` 前缀的变量

客户端代码里能访问的，只有：

- `import.meta.env.MODE`
- `import.meta.env.DEV` / `PROD`
- `import.meta.env.BASE_URL`
- `import.meta.env.SSR`
- **以 `VITE_` 开头**的自定义变量

本仓库的 `.env`：

```dotenv
VITE_APP_TITLE=Vite 一天动手实验室
VITE_API_BASE=https://api.example.com
DB_PASSWORD=super-secret-password   # 没有 VITE_ 前缀
```

页面上的 `import.meta.env` 表格里**不会**出现 `DB_PASSWORD`。

> 这是**编译期白名单**，不是运行时隐藏。任何以 `VITE_` 开头的变量都会被打进产物，用 `grep` 就能搜到。密钥永远不要用 `VITE_` 前缀。

## 二、文件加载顺序与优先级

按 mode 依次加载，后面的覆盖前面的：

```text
.env                # 所有 mode 共享
.env.local          # 本地覆盖，git 忽略
.env.[mode]         # 例如 .env.development
.env.[mode].local   # 本地覆盖，优先级最高
```

本项目实际文件：

| 文件 | 作用 |
| --- | --- |
| `.env` | 公共默认值 |
| `.env.development` | `pnpm dev` 时生效 |
| `.env.production` | `pnpm build` 时生效 |
| `.env.staging` | `pnpm build:staging` 时生效 |
| `.env.example` | 提交到仓库的模板 |

`mode` 的默认值：`dev` → `development`，`build` → `production`。用 `--mode staging` 可以自定义。

## 三、`mode` 与 `NODE_ENV` 的关系

```bash
pnpm build:staging
# = vite build --mode staging
```

结果：

- `import.meta.env.MODE === 'staging'`
- 加载 `.env.staging`
- 但 `process.env.NODE_ENV === 'production'`（build 默认如此）

也就是说：**`mode` 决定加载哪份 env，`NODE_ENV` 决定依赖库走哪条代码分支**。不要为了切环境去改 `NODE_ENV`。

## 四、在 `vite.config` 里读变量

```js
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // 第三个参数为 '' 表示不限制前缀，能读到 DB_PASSWORD
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // 这里可以按 env 做构建期决策，例如：
    // base: env.VITE_CDN_BASE ?? '/'
  }
})
```

注意：

- `loadEnv` 返回的变量**只存在于 Node 侧**，不会自动进入客户端。
- `process.env` 在配置文件里也能读到系统环境变量（CI 场景常用）。
- 想把它注入客户端，必须显式用 `define`，并且清楚自己在泄露什么。

## 五、动手步骤

1. 启动开发环境：

   ```bash
   pnpm dev
   ```

   页面标题应为「…（开发）」，表格里 `MODE=development`、`VITE_API_BASE=https://api.dev.example.com`。

2. 终端里能看到 `[vite.config] VITE_API_BASE=..., DB_PASSWORD=已读取（仅构建期）`。

3. 打开 Console，`console.table(import.meta.env)` 的结果里搜一下 `DB_PASSWORD`——不存在。

4. 构建 staging 并预览：

   ```bash
   pnpm build:staging
   pnpm preview
   ```

   标题变为「…（预发）」，API 地址变为 staging 的地址。

5. 验证密钥没有进入产物：

   ```bash
   grep -r "super-secret-password" dist || echo "没有泄露"
   ```

6. （可选）创建 `.env.development.local`，写 `VITE_APP_TITLE=本地标题`，重启 dev，确认优先级最高。这个文件不会被 git 跟踪。

## 观察点

- `dist/assets/*.js` 里已经是**字面量字符串**，说明 env 在构建期被静态替换（这也意味着改了 env 必须重新构建）。
- `import.meta.env.DEV` 在产物里是 `false`，相关分支会被摇树优化掉。

## 检查点

```bash
pnpm build:staging >/dev/null && grep -o "预发" dist/assets/*.js | head -1
grep -r "super-secret-password" dist || echo "没有泄露"
```

- [ ] dev 下标题显示「开发」
- [ ] staging 构建后标题显示「预发」
- [ ] 产物中没有 `DB_PASSWORD` 的值
- [ ] 能背出 4 个 env 文件的优先级顺序

## 常见坑

- **给密钥加了 `VITE_` 前缀** → 直接泄漏到浏览器。
- **改完 `.env` 不重启** → 变量不更新（env 在启动/构建时读取）。
- **在浏览器代码里用 `process.env.XXX`** → Vite 不再默认注入 `process.env`，应使用 `import.meta.env`。
- **以为 `.env.local` 会被提交** → 本项目 `.gitignore` 已忽略 `*.local`，但请自行确认。
- **在 CI 里依赖 `.env.production`** → 生产密钥应走 CI 的环境变量，而不是仓库里的文件。
- **字符串类型的布尔值**：`VITE_FEATURE=true` 拿到的是字符串 `"true"`，需要自己转换。

## 进阶（可跳过）

- `envDir`：把 env 文件放到其他目录（如 monorepo 根目录）。
- `envPrefix`：修改暴露前缀（不推荐，容易和依赖冲突）。
- 阅读：<https://vite.dev/guide/env-and-mode>

## 对照答案

```bash
git diff ch03 ch04
```
