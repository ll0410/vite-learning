# Markdown 已成为 Vue 组件

这段文字来自 lesson.md，插件生成 SFC 后再交给 Vue 编译。

## 支持的最小子集

- 一至三级标题
- 段落与无序列表
- 围栏代码块

### 默认转义

<script>alert('不会执行')</script> 与 {{ 1 + 1 }} 都只按文本展示。

```ts
const source = 'lesson.md'
```
