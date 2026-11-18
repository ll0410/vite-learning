# ch07 CSS 工程化（预计 70 分钟）

## 本章目标

1. 会用 SCSS、CSS Modules、PostCSS 三种主流方案，并知道各自的适用场景。
2. 理解 `additionalData` 注入变量的机制与代价。
3. 知道 Vite 8 构建期 CSS 压缩默认是 Lightning CSS，以及它对产物的影响。
4. 能预判 CSS 顺序、作用域、代码分割相关的常见问题。

## 前置

完成 ch05。

## 一、四种「写 CSS」的方式

| 方式 | 写法 | 特点 | 适用 |
| --- | --- | --- | --- |
| 全局 CSS | `import './styles/main.css'` | 全局生效，无隔离 | reset、变量、基础排版 |
| `<style scoped>` | SFC 内置 | 通过 `data-v-xxx` 属性隔离 | 组件样式（Vue 默认选择） |
| CSS Modules | `import styles from './x.module.css'` | 类名编译成哈希，强隔离 | 组件库、多人协作 |
| 预处理器 | `lang="scss"` / `.scss` 文件 | 变量、嵌套、mixin | 主题、复用逻辑 |

Vite 对前三者零配置支持（`sass` 需要装依赖）。

## 二、本章新增的内容

```text
src/styles/
├── _variables.scss     # SCSS 变量，被自动注入
├── main.css            # 全局样式 + CSS 变量
└── button.module.css   # CSS Modules 示例
src/components/HelloWorld.vue  # 使用 CSS Modules + scoped SCSS
postcss.config.js       # autoprefixer
```

配置：

```ts
css: {
  devSourcemap: true,
  preprocessorOptions: {
    scss: {
      additionalData: '@use "@/styles/variables" as *;\n',
    },
  },
},
```

## 三、`additionalData` 的原理与代价

它会在**每个** `<style lang="scss">` / `.scss` 文件的最前面插入这段代码。

好处：不用每个文件都写 `@use`。

代价：

- 每个 SCSS 文件都会多一次模块解析（文件多时有可感知开销）。
- 注入内容里**不能有会产出 CSS 的规则**，否则每个文件都会重复输出。
- 只注入变量/mixin 是安全用法；注入具体样式类是错误用法。

## 四、CSS Modules 是怎么工作的

```vue
import styles from '@/styles/button.module.css'
```

- 构建时类名被替换成 `._btn_3w3xu_2` 这样的唯一名字（`文件hash_序号`）。
- 同时生成一份「原名 → 哈希」的映射，供 JS 使用。
- 因此两个不同组件写 `.btn` 不会冲突。

注意：CSS Modules 的类名**不要**用 `:global` 混用，容易失去隔离意义。

## 五、Vite 8 的 CSS 压缩：Lightning CSS

- 默认 `build.cssMinify: 'lightningcss'`。
- 它会把 `rgba(47, 143, 104, 0.25)` 压成 `#2f8f6840`（8 位十六进制）。
- 语法降级能力比 esbuild 强，CSS 体积可能有小幅变化，属正常现象。
- 想回退：`build.cssMinify: 'esbuild'`，但**必须自己安装 `esbuild`**。

本仓库构建后的实际产物可以验证：

```bash
grep -o "box-shadow:[^;]*" dist/assets/*.css
```

## 六、动手步骤

1. 启动 dev：

   ```bash
   pnpm dev
   ```

2. 首页应该出现绿色胶囊按钮。点击时计数 +1。

3. DevTools → Elements，选中按钮，观察 class：

   ```html
   <button class="_btn_3w3xu_2" data-v-xxxx>点我 +1</button>
   ```

   `_btn_xxx` 是 CSS Modules 的哈希名，`data-v-xxx` 是 scoped 样式的隔离属性。

4. 修改 `_variables.scss` 里的 `$brand`，保存：按钮阴影与 scoped 样式立即更新（HMR）。

5. DevTools → Sources，确认能看到 SCSS 源码（`devSourcemap: true` 的效果）。

6. 生产构建并检查：

   ```bash
   pnpm build
   grep -o -- "-webkit-user-select" dist/assets/*.css   # autoprefixer 生效
   grep -o "box-shadow:[^;]*" dist/assets/*.css          # SCSS 变量已求值
   ```

## 观察点

- 构建后 CSS 被合并成一个文件（本项目只有一个入口，`cssCodeSplit` 默认 `true` 但只有一个 chunk）。
- 组件库场景下如果用了动态 import，CSS 会跟着 chunk 拆分。
- scoped 样式最终变成 `h1[data-v-xxx]` 这种属性选择器。

## 检查点

- [ ] 按钮类名带哈希
- [ ] `-webkit-user-select` 出现在产物 CSS 中
- [ ] SCSS 变量已编译成具体值
- [ ] DevTools 能定位到 SCSS 源文件

## 常见坑

- **`additionalData` 注入样式规则** → 每个组件都重复输出一份 CSS，体积暴涨。
- **Sass 与 sass-embedded 混装** → 请只保留一个；本项目用 `sass-embedded`（更快）。
- **CSS 引入顺序不可控** → 多个 chunk 各自 import CSS 时，最终顺序由 chunk 加载顺序决定，覆盖关系可能和 dev 不一致。全局覆盖样式建议放在入口最先引入。
- **`<style scoped>` 里写 `:deep()` 失效** → 检查选择器是否被 scoped 属性截断。
- **CSS Modules 里用 `-` 命名** → 需要 `styles['my-class']`，建议统一 camelCase。
- **以为 CSS 一定只有一个文件** → 开了代码分割后每个异步 chunk 可能有自己的 CSS。

## 进阶（可跳过）

- `css.lightningcss.targets`：精确控制降级目标，替代 `build.cssTarget`。
- `css.transformer: 'lightningcss'`：开发期也用 Lightning CSS 处理（默认仍是 PostCSS）。
- 阅读：<https://vite.dev/guide/features#css>、<https://lightningcss.dev/>

## 对照答案

```bash
git diff ch06 ch07
```
