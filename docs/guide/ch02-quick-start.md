# ch02 快速开始（预计 40 分钟）

## 本章目标

1. 不用脚手架，手写一个能跑的最小 Vite 项目。
2. 分清 `vite` / `vite build` / `vite preview` 三条命令。
3. 知道 `index.html` 在 Vite 里的特殊地位。
4. 能从终端输出读懂 dev server 与构建产物。

## 前置

完成 ch01。

## 一、最小项目只有三个文件

```text
vite-learning/
├── index.html        # 入口，必须有
├── src/main.js       # 业务入口
└── vite.config.js    # 可选，本项目用来逐章演进
```

`index.html`：

```html
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
```

`vite.config.js`：

```js
import { defineConfig } from 'vite'
export default defineConfig({})
```

就这么多。Vite 没有 `entry` 配置的概念——**HTML 就是入口**。

## 二、三条命令的区别

| 命令 | 做什么 | 产物 | 用途 |
| --- | --- | --- | --- |
| `pnpm dev` | 启动 dev server，按需编译 | 无（内存中） | 日常开发 |
| `pnpm build` | 生产构建 | `dist/` | 发版前 |
| `pnpm preview` | 起一个静态服务器托管 `dist/` | 无 | 本地验收产物 |

关键差异：

- `dev` 访问的是**源码经即时转译后的 ESM**。
- `preview` 访问的是**真正的构建产物**，两者行为可能不同（例如环境变量、压缩、代码分割），所以**上线前一定要 preview 验收**。

## 三、动手步骤

1. 确认依赖已安装：

   ```bash
   pnpm install
   ```

2. 启动开发服务器：

   ```bash
   pnpm dev
   ```

   终端应输出类似：

   ```text
     VITE v8.3.8  ready in 150 ms
     ➜  Local:   http://localhost:5173/
   ```

3. 打开 <http://localhost:5173>，你应该看到「Vite 一天动手实验室」卡片，页面上有 `MODE=development`、`DEV=true`。

4. 打开 DevTools → Console，能看到 `[ch02] main.js executed`。

5. 打开 DevTools → Network，刷新，观察请求：

   | 请求 | 说明 |
   | --- | --- |
   | `/` | index.html |
   | `/src/main.js` | 源码，被 Vite 加上了一些 HMR 相关代码 |
   | `/@vite/client` | HMR 客户端 |

6. 修改 `src/main.js` 里的任意文案，保存。页面**没有整页刷新**，文案直接变了——这就是 HMR（ch09 详解）。

7. 停掉 dev server（`Ctrl+C`），执行生产构建：

   ```bash
   pnpm build
   ```

   终端输出类似：

   ```text
   vite v8.3.8 building client environment for production...
   ✓ 5 modules transformed.
   dist/index.html                 0.45 kB │ gzip: 0.30 kB
   dist/assets/index-xxxxxxx.js    0.83 kB │ gzip: 0.48 kB
   ✓ built in 60ms
   ```

8. 预览产物：

   ```bash
   pnpm preview
   ```

   打开 <http://localhost:4173>，页面应与 dev 一致。

## 观察点

- `pnpm dev` 启动几乎瞬间完成，因为此时**没有编译任何代码**。
- `dist/index.html` 里的 `<script>` 已经被替换成带 hash 的产物文件。
- `dist/assets/*.js` 里 `import.meta.env` 已被静态替换成字面量（搜一下 `development` / `production`）。
- 产物 JS 是压缩过的，几乎不可读（Vite 8 用 Oxc 压缩）。

## 检查点

```bash
pnpm build
ls -R dist
```

- [ ] `dist/index.html` 存在，且 script 指向 `assets/` 下的文件
- [ ] `dist/assets/` 至少有一个 `.js`
- [ ] `pnpm preview` 能正常访问
- [ ] 能说出 `dev` 与 `preview` 访问的内容有什么本质不同

自测问题：

1. 删除 `index.html` 后 `pnpm dev` 会怎样？
2. 为什么 `index.html` 里的 script 路径写 `/src/main.js` 而不是 `./src/main.js`？
3. `vite.config.js` 删掉后项目还能跑吗？
4. `dist/` 需要提交到 git 吗？

## 常见坑

- **端口不是 5173**：说明端口被占用，Vite 自动换了一个。看终端输出的实际地址。
- **改了 `vite.config.js` 页面没反应**：配置文件不会热更新，必须重启 dev server（ch03 详述）。
- **`pnpm dev` 报 Node 版本错误**：Vite 8 要求 Node `^20.19.0 || >=22.12.0`。
- **直接双击打开 `index.html`**：不行。`file://` 协议下 ESM 会被浏览器拦截，必须通过 http 访问。
- **`pnpm build` 后打开 `dist/index.html` 白屏**：同理，产物也要用静态服务器（`pnpm preview`）访问。

## 进阶（可跳过）

- 阅读 Vite 的 `index.html` 处理规则：<https://vite.dev/guide/#index-html-and-project-root>
- 试着把 `index.html` 移到 `nested/` 目录，观察 dev server 入口变成 `http://localhost:5173/nested/`。

## 对照答案

```bash
git diff ch01 ch02
```

本章新增：

- `index.html`
- `src/main.js`
- `vite.config.js`
- `docs/ch02-quick-start.md`
