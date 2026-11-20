# ch03 默认配置与常见问题（预计 60 分钟）

## 本章目标

1. 读懂 `vite.config.js` 的加载时机与函数式写法。
2. 会用 `resolve.alias`、`server`、`build` 三组最常用配置。
3. 能自己排查「白屏 / 端口 / base 路径 / 配置不生效」这四类高频问题。
4. 分清 `mode` 与 `NODE_ENV`。

## 前置

完成 ch02。

## 一、配置是怎么被加载的

```text
执行 vite / vite build
        ↓
在 root 下查找 vite.config.{js,ts,mjs,cjs,mts,cts}
        ↓
用 esbuild/oxc 即时转译该配置文件
        ↓
得到配置对象 → 启动 dev server 或构建
```

由此得出三个结论：

1. **配置文件支持 TS**，不需要提前编译。
2. **配置文件不会被 HMR**：改了必须重启 dev server。
3. 配置对象在**启动时求值一次**，所以里面可以写 Node 代码（读文件、读环境变量）。

## 二、函数式配置

```js
export default defineConfig(({ command, mode }) => {
  return {
    // command: 'serve' | 'build'
    // mode:    'development' | 'production' | 'staging' | ...
  }
})
```

什么时候用函数式？

- 需要根据 `command` / `mode` 返回不同配置（最典型）。
- 需要读取环境变量（ch04 会用到）。

`defineConfig` 本身只是类型辅助，直接导出一个对象也能跑。

## 三、本章新增的配置

```js
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
},
server: {
  port: 5173,
  strictPort: false,
  open: false,
},
build: {
  outDir: 'dist',
  assetsDir: 'assets',
},
```

要点：

- `alias` 的值必须是**绝对路径**。用相对字符串（如 `'./src'`）会在不同 cwd 下失效。
- `strictPort: false` 表示端口被占用时自动 +1。
- `outDir` / `assetsDir` 决定产物结构，改了要同步改部署脚本与 `base`。

## 四、`base`：最容易导致上线白屏的配置

`base` 决定产物里的资源前缀：

| 场景 | base |
| --- | --- |
| 部署在域名根目录 | `'/'`（默认） |
| 部署在子路径 `/app/` | `'/app/'` |
| 部署在 CDN | `'https://cdn.example.com/app/'` |
| 相对路径部署 | `'./'` |

本章不写死 `base`，用 CLI 临时体验：

```bash
pnpm build --base=/app/
pnpm preview
# 打开 http://localhost:4173/app/
```

对比 `dist/index.html` 里 script 的 src，会从 `/assets/...` 变成 `/app/assets/...`。

> `base` 配错是「本地好好的、上线一片白」的第一大原因。上线前一定用 `pnpm preview` 按真实路径验收。

## 五、必须知道的常识问题

### 1. 为什么必须有 `index.html`

Vite 以 HTML 为入口，自动解析其中的 `<script type="module">` 与资源引用。没有 HTML 就没有入口（库模式除外）。

### 2. 多页应用怎么配

```js
build: {
  rolldownOptions: {
    input: {
      main: 'index.html',
      admin: 'admin/index.html',
    },
  },
},
```

注意 Vite 8 用 `rolldownOptions`（`rollupOptions` 是废弃别名）。开发时直接访问 `/admin/index.html` 即可。

### 3. 改了配置为什么没生效

配置不会热更新，也没有 HMR。改完 `Ctrl+C` 重启。改 `.env` 文件同理。

### 4. `resolve.alias` 生效了，但编辑器报红

Vite 只负责运行时/构建时解析，编辑器需要自己的映射：

- JS 项目：`jsconfig.json` 的 `compilerOptions.paths`
- TS 项目：`tsconfig.json` 的 `compilerOptions.paths`

两边不同步，就会出现「能跑但类型报错」。ch05 会补上。

### 5. `mode` 不是 `NODE_ENV`

| 概念 | 来源 | 用途 |
| --- | --- | --- |
| `mode` | `vite --mode xxx`，默认 dev 为 `development`、build 为 `production` | 决定加载哪个 `.env.[mode]` 文件、`import.meta.env.MODE` |
| `NODE_ENV` | 环境变量，Vite 在 build 时默认设为 `production` | 影响依赖库内部的 dev/prod 分支 |

二者可以不一致，例如 `vite build --mode staging` 时 `mode=staging` 而 `NODE_ENV=production`。

### 6. 开发时用局域网访问

```bash
pnpm dev --host
# 或
pnpm dev --host 0.0.0.0
```

### 7. 端口被占用

`strictPort: false` 会自动换端口。多项目同时开发时建议给每个项目固定端口 + `strictPort: true`，避免「我到底开的是哪个项目」。

## 六、动手步骤

1. 重启 dev server：

   ```bash
   pnpm dev
   ```

2. 控制台应出现 `[vite.config] command=serve, mode=development`。

3. 页面上的「别名验证」应显示 `2 + 3 = 5，2 × 3 = 6`。若显示不出来，说明 alias 没生效。

4. 把 `@/utils/math` 临时改成 `../utils/math`，确认同样能跑——理解 alias 只是解析规则的封装。

5. 验证 base：

   ```bash
   pnpm build --base=/app/
   pnpm preview
   ```

   访问 <http://localhost:4173/app/>。

## 观察点

- 终端 `[vite.config]` 日志只在启动时打印一次。
- 改 `vite.config.js` 后页面不会更新，终端也不会重打印——必须重启。
- `dist/index.html` 的 script 路径随 `--base` 变化。

## 检查点

```bash
# 1. 别名生效
pnpm build && grep -c "别名验证" dist/assets/*.js

# 2. base 生效
pnpm build --base=/app/ && grep -o 'src="[^"]*"' dist/index.html

# 3. 端口占用时的行为（可选）
pnpm dev --port 5173 --strictPort
```

- [ ] 页面显示别名计算结果
- [ ] `--base=/app/` 后产物引用前缀变化
- [ ] 能解释「配置改了要重启」

## 常见坑

- `alias` 写成相对路径 → 构建时找不到模块。
- 只配了 `alias` 没配 `tsconfig.paths` → 编辑器报红（ch05 解决）。
- 用 `base: './'` 又开了 history 路由 → 刷新子路由 404（ch05 会讲）。
- 把 `NODE_ENV=development` 手动塞进 build 命令 → 部分库行为异常，不要这么做。
- 目录名带空格/中文 → 某些插件路径处理异常，尽量用英文目录。

## 进阶（可跳过）

- 多页应用：新建 `admin/index.html`，按上面的 `input` 配置构建，观察 `dist` 出现两个 HTML。
- 阅读：<https://vite.dev/config/shared-options#resolve-alias>、<https://vite.dev/config/server-options>

## 对照答案

```bash
git diff ch02 ch03
```
