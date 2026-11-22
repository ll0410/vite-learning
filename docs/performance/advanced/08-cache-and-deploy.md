# 12.4 缓存、CDN 与部署产物

把首屏体积从 200 KB 降到 100 KB，只完成了一半。如果缓存策略不对，用户每次访问仍然要重新下载；如果发版后 CDN 还在发旧 HTML，代码分割和 chunk 兜底都会失效。缓存的目标是：**带哈希的资源尽量长缓存，入口 HTML 每次重新验证。**

::: tip 结论先行
- **适用**：所有静态部署的 Vite 项目，尤其是使用 CDN 或多环境发布的产品。
- **推荐**：`/assets/*` 使用 `public, max-age=31536000, immutable`；HTML 使用 `no-cache` 或 `max-age=0, must-revalidate`；vendor 分组保持稳定。
- **代价**：HTML 不缓存会增加一次协商请求，但能保证发版后立刻拿到新入口。
- **不要**：给 `index.html` 配长缓存；也不要在构建期和服务端同时做压缩。
:::

## 问题与判断

先检查三类文件：

| 文件 | 是否带内容哈希 | 推荐缓存 |
| --- | --- | --- |
| `dist/assets/*.js`、`*.css`、图片、字体 | 是 | `public, max-age=31536000, immutable` |
| `dist/index.html`、`admin.html` | 否 | `no-cache` 或 `max-age=0, must-revalidate` |
| `dist/version.json`、`cdn-manifest.json` | 否 | 短缓存或不缓存 |

带哈希的文件内容变化时文件名也变，可以放心长缓存；HTML 文件名固定，必须每次验证，否则会继续引用旧 chunk。

## 做法

### 1. 本仓库已经生成的真实缓存配置

`plugins/build-output/static-deployment.ts` 会在构建时生成 `dist/_headers`，内容等价于：

```text
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: public, max-age=0, must-revalidate
```

`_headers` 是部分静态托管平台识别的配置格式，不是浏览器直接请求的资源。换到 Nginx 时，需要把同样的策略写进配置：

```nginx
location /assets/ {
  add_header Cache-Control "public, max-age=31536000, immutable";
}

location = /index.html {
  add_header Cache-Control "no-cache";
}
```

如果使用 CDN，要在 CDN 侧配置同样的规则，而不是只改源站。否则边缘节点仍可能按旧策略缓存 HTML。

### 2. 版本文件与 CDN 清单

`plugins/build-output/deployment-artifacts.ts` 会生成：

- `dist/version.json`：本批产物的版本号与逐文件 SHA-256。
- `dist/cdn-manifest.json`：上传路径、完整 CDN URL 和内容摘要。

`version.json` 的结构大致是：

```json
{
  "version": "整批内容的二次哈希",
  "algorithm": "sha256",
  "builtAt": "2026-01-01T00:00:00.000Z",
  "files": {
    "assets/index-*.js": "文件内容哈希",
    "assets/vendor-vue-*.js": "文件内容哈希"
  }
}
```

用途：

- 部署脚本据此判断哪些文件需要上传或刷新 CDN。
- 监控系统可以对比线上版本号与构建版本号。
- 回滚时可以按版本号找回一批文件。

注意：`version.json` 和 `cdn-manifest.json` 自身文件名固定，**不要套用 `assets/*` 的 immutable 长缓存**。

### 3. 缓存与 vendor 分组的关系

如果所有依赖塞进一个巨大的 vendor chunk，改一行业务代码也可能让整个 chunk 哈希变化，缓存全部失效。稳定的分组策略是：

- 框架（vue / vue-router）单独一组，变化频率最低。
- 工具库（lodash-es / dayjs）单独一组，变化频率中等。
- 业务代码按路由拆分，变化频率最高。

具体字段见 [11.3 Rolldown codeSplitting.groups 调优](./03-rolldown-groups.md)。分组不是越细越好，目标是让「不常变的部分」尽量保持同一份缓存。

### 4. 预压缩放哪一层

`.gz` / `.br` 可以在构建期生成，也可以由 Nginx / CDN 动态压缩。两者选其一：

- 构建期预压缩：压缩档位更高，服务端零 CPU 成本，但部署文件更多。
- 服务端动态压缩：部署简单，但每次请求消耗 CPU，压缩等级通常较低。

细节和 Nginx 配置见 [附录：预压缩产物](../appendix-precompressed-assets.md)。不要两边都开，导致对已经压缩过的文件再次压缩。

## 在本仓库验证

```bash
pnpm build
cat dist/_headers
head -40 dist/version.json
head -20 dist/cdn-manifest.json
```

预期：

- `_headers` 中 `/assets/*` 为 immutable，HTML 为重新验证。
- `version.json` 包含 `version`、`algorithm`、`files`。
- `cdn-manifest.json` 包含每个文件的 `path`、`url`、`sha256`。

再启动预览并检查响应头：

```bash
pnpm preview
curl -I http://localhost:4173/index.html
curl -I http://localhost:4173/assets/$(ls dist/assets | grep '^index-.*\.js$' | head -1)
```

注意：`vite preview` 是本地静态服务器，不一定完全复刻生产 CDN 的缓存行为。它能验证文件是否存在、HTML 引用是否正确；真实缓存头要在部署环境或 CDN 控制台确认。

## 常见坑

- **给 `index.html` 配长缓存**：发版后用户仍拿到旧入口，继续请求已删除的 chunk。
- **CDN 只刷新源站**：边缘节点未刷新，缓存策略和文件都可能是旧的。
- **对无哈希文件用 immutable**：`version.json`、`cdn-manifest.json` 会被长期缓存，部署工具读到旧数据。
- **vendor 分组不稳定**：每次构建 chunk 边界变化，缓存命中率下降。
- **构建期和服务端双重压缩**：对 `.br` 再压一次，体积不降反升。
- **忽略 HTML 的 ETag / Last-Modified**：只配 `no-cache` 但没有验证器，退化为每次完整下载。
- **部署时删除旧文件过早**：正在使用旧页面的用户会立刻遇到 chunk 404，需要配合 [11.2](./02-chunk-load-error.md) 的兜底。

## 延伸阅读

- [ch12 Vite 性能优化](../ch12-performance.md)
- [附录：预压缩产物（.gz / .br）](../appendix-precompressed-assets.md)
- [11.2 懒加载失败与发版后旧 chunk 404](./02-chunk-load-error.md)
- [12.5 体积预算、sourcemap 与线上可观测性](./09-budget-and-observability.md)
