# 11.2 懒加载失败与发版后旧 chunk 404

代码分割把一次大请求拆成了多次小请求，也把「加载失败」从一个边缘情况变成了必须处理的路径。最常见的两种失败是：用户网络抖动导致 `import()` 超时；应用发版后旧 `index.html` 还在引用已经删除的带哈希 chunk，浏览器拿到 404。

::: tip 结论先行
- **适用**：所有使用路由懒加载或组件级 `import()` 的 SPA，尤其是发版频繁、用户会话较长的产品。
- **推荐**：`router.onError` 统一识别 chunk 加载错误；组件级 `import()` 用 `try/catch` 给出重试；发版场景只允许刷新一次，用 `sessionStorage` 防止循环。
- **代价**：刷新会丢失当前页面状态，所以只对「旧 chunk 已不存在」这类无法原地恢复的错误使用。
- **不要**：无限重试或每次失败都 `location.reload()`，那会把小故障放大成刷新风暴。
:::

## 问题与判断

先分清两类错误，处理方式不同：

| 现象 | 典型原因 | 处理方式 |
| --- | --- | --- |
| 弱网、断网、请求超时 | 网络暂时不可用 | 提示重试，有限次数退避 |
| 发版后旧 chunk 404 | 新构建删除了旧哈希文件 | 重新加载 `index.html`，拿到新资源清单 |
| CDN 缓存了旧 HTML | HTML 缓存策略错误 | 修缓存头，见 [12.4](./08-cache-and-deploy.md) |
| 用户停留在旧页面很久 | 长会话 + 频繁发版 | 首次导航失败时一次性刷新 |

如果项目几乎没有懒加载，或者每次发版都会强制用户重新登录，这类兜底可以简化；但只要有动态 `import()`，就建议至少加一层错误提示，不要让页面静默白屏。

## 做法

### 1. 在路由层统一兜底

Vue Router 的 `onError` 能拿到导航过程中抛出的错误。下面是一段**示例，按需加入** `src/router/index.ts`：

```ts
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

const RELOAD_KEY = 'chunk-reload-at'

router.onError((error) => {
  if (!CHUNK_ERROR.test(error.message)) return

  const lastReloadAt = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  if (Date.now() - lastReloadAt < 10_000) return

  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  window.location.reload()
})
```

要点：

- 只匹配 chunk 加载错误，不要把普通业务异常也当成发版问题。
- 10 秒窗口只是防止刷新循环的最小保护；如果刷新后仍然失败，应该展示错误页，而不是继续刷新。
- `sessionStorage` 在标签页关闭后清空，不会永久抑制后续正常刷新。

### 2. 组件级动态导入给出可恢复的重试

`Home.vue` 里的 `loadFormatModule` 目前直接 `await import('@/utils/format')`。可以包一层有限重试：

```ts
async function retryImport<T>(loader: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await loader()
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt))
      }
    }
  }

  throw lastError
}
```

调用时维护加载状态，避免用户重复点击：

```ts
const loading = ref(false)
const errorMessage = ref('')

async function loadFormatModule() {
  loading.value = true
  errorMessage.value = ''
  try {
    const mod = await retryImport(() => import('@/utils/format'))
    formatResult.value = [
      `日期：${mod.formatDate(Date.now())}`,
      `slug：${mod.slugify('Vite Code Splitting')}`,
    ]
  } catch {
    errorMessage.value = '模块加载失败，请检查网络后重试'
  } finally {
    loading.value = false
  }
}
```

退避时间不必很复杂：两次重试、300ms / 600ms 已经能覆盖大部分瞬时抖动。真正的发版 404 重试多少次都没用，最终仍要靠刷新拿到新 chunk。

### 3. 为什么刷新能解决发版 404

SPA 的路由表在 `index.html` 加载的入口 chunk 里。发版后：

1. 旧页面内存中的路由仍指向旧哈希文件名。
2. 新构建已经删除了旧 chunk，CDN / 静态服务器返回 404。
3. 刷新会重新请求 `index.html`，拿到新入口和新 chunk 映射。
4. 新入口再按需加载新文件。

所以刷新能生效的前提是 **`index.html` 本身不能被长缓存**。如果 HTML 也被 CDN 缓存一年，刷新只会拿到旧入口，继续 404。缓存头配置见 [12.4 缓存、CDN 与部署](./08-cache-and-deploy.md)。

## 在本仓库验证

### 1. 模拟网络失败

```bash
pnpm dev
```

打开首页，DevTools → Network：

- 切换到 `Offline`，点击「动态加载 format 模块」。
- 或在请求列表里右键 `format-*.js` → `Block request URL`，再点击按钮。

预期：页面显示错误提示，而不是静默无反应；恢复网络后再次点击可以成功。

### 2. 模拟发版后旧 chunk 404

```bash
pnpm build
pnpm preview
```

在浏览器打开 `http://localhost:4173`，先停留在首页。然后重新执行一次 `pnpm build`（哈希会变化），重启 `pnpm preview`，再在旧页面点击进入 Dashboard。

预期：旧页面请求旧 `Dashboard-*.js` 得到 404，`router.onError` 触发一次性刷新，刷新后进入新版本页面。若没有触发，检查：

- `pnpm preview` 是否真的在服务新 `dist`。
- 浏览器是否缓存了旧 `index.html`。
- 错误信息是否被浏览器改写，导致正则没有匹配。

> 本地验证会临时改动运行中的 dist 与页面状态，验证完重新 `pnpm build` 即可，不需要修改源码。

## 常见坑

- **只 `catch` 不提示**：用户看到按钮没反应，以为功能坏了。
- **刷新循环**：没有时间窗口或次数限制，遇到持续 404 会无限刷新。
- **把网络错误当发版错误**：弱网重试即可，直接刷新会丢失表单和滚动位置。
- **忘记 HTML 缓存策略**：只处理 chunk 错误，但 `index.html` 本身被长缓存，刷新也拿不到新入口。
- **Service Worker 缓存旧资源**：有 PWA 时要在发版时更新缓存版本，否则刷新仍可能命中旧 chunk。
- **CDN 未刷新**：静态资源删除后边缘节点仍有旧缓存，需要用版本化路径或主动刷新。
- **重试没有上限**：组件级重试和路由级刷新叠加时，要确保总次数可控。

## 延伸阅读

- [ch11 Code Splitting 代码分割](../ch11-code-splitting.md)
- [11.4 预加载、modulepreload 与 chunkImportMap](./04-preload-and-importmap.md)
- [12.4 缓存、CDN 与部署产物](./08-cache-and-deploy.md)
