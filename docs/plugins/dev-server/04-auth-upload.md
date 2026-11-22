# 17. 模拟 SSO 登录回调与文件上传

登录回调、Cookie、会话和文件上传经常分散在不同框架中，只看最终页面很难知道每一步发生了什么。本例把它们压缩到一个 Vite 开发插件和一个 Vue 页面里：**固定教学 code 换来内存会话，浏览器凭 Cookie 查询用户并上传原始字节，最后看到文件名、实际字节数和 SHA-256 摘要。** 这里，Cookie 是浏览器保存并随请求自动携带的一小段状态；SHA-256 则是根据字节内容计算固定长度摘要的算法。

它不是一次真实的单点登录（SSO），也不会把上传文件保存到磁盘；这些简化正是为了完整观察 HTTP 请求怎样穿过 Vite 开发服务器。

::: tip 现成方案速览
- **官方 / 成熟方案**：[`vite-plugin-mock-dev-server`](https://github.com/pengzhanbo/vite-plugin-mock-dev-server) 可以组合 Cookie、响应头和上传模拟，MSW 可以模拟前端网络行为；真实 SSO、会话安全和文件存储必须由 IdP / 后端承担。
- **覆盖程度**：**无通用方案**（生产）。
- **本例定位**：教学用最小实现，重点是理解中间件如何模拟 SSO 回调、Cookie 会话和原始字节上传。
- **值得自研的时机**：仅限本地联调；生产认证与上传不要基于本例扩展。
:::

## 核心示例：从模拟回调到上传结果

先看整条链路，再回头拆实现：

```text
点击“模拟 SSO 登录”
  → GET /api/lab/auth/sso/callback?code=vite-lab-teaching-code
  → 校验固定 code，创建内存会话
  → 302 Location + Set-Cookie
  → 回跳 /plugins/dev-server/auth-upload-demo?login=success
  → 页面请求 GET /api/lab/auth/session，浏览器自动携带 Cookie
  → 显示当前用户 Vite Learner（lab-user）
  → 选择文件，POST /api/lab/auth/upload?filename=...
  → 返回 name、size、sha256，页面显示上传结果
```

### 1. 输入：固定 code 触发一次模拟回调

演示组件 `src/views/plugins/dev-server/DevServerDemos.vue` 中的登录按钮只有一步：

```ts
window.location.assign('/api/lab/auth/sso/callback?code=vite-lab-teaching-code')
```

这会让浏览器离开当前页面并发起 GET 请求。插件只接受字符串完全相等的 `vite-lab-teaching-code`：缺失或传入其他 code 都返回 `401` 和 `{ "error": "invalid_teaching_code" }`，不会创建会话。

校验通过后，插件用 `randomUUID()` 生成随机会话令牌，在服务端内存的 `Map` 中保存令牌与用户的对应关系，然后返回 `302`。`302` 在这里表示“请浏览器继续访问 `Location` 指定的地址”，关键响应头是：

```text
Location: /plugins/dev-server/auth-upload-demo?login=success
Set-Cookie: vite_lab_session=<随机 UUID>; HttpOnly; SameSite=Lax; Path=/
Cache-Control: no-store
```

Cookie 中只有随机令牌；`{ id: 'lab-user', name: 'Vite Learner' }` 留在服务端。回跳地址中的 `login=success` 只是页面 URL 的一部分，**登录态不来自这个查询参数，而来自 Cookie 能否在服务端 `Map` 中找到用户。**

### 2. 消费会话：回跳页面查询当前用户

`src/plugin-lab/routes/dev-server.ts` 把 `/plugins/dev-server/auth-upload-demo` 映射到 `DevServerDemos.vue`，并传入 `scenario: 'auth-upload'`。组件挂载时会为这个场景调用 `loadSession()`：

```ts
const response = await fetch('/api/lab/auth/session')
```

`fetch` 没有手写 Cookie 请求头。浏览器会按照 Cookie 的作用域自动携带 `vite_lab_session`，插件再用其中的令牌查询内存 `Map`。已登录时响应为：

```json
{"authenticated":true,"user":{"id":"lab-user","name":"Vite Learner"}}
```

页面据此显示“当前用户：Vite Learner（lab-user）”。没有 Cookie、令牌未知或服务重启后，响应仍是 `200`，只是内容变为：

```json
{"authenticated":false,"user":null}
```

因此“未登录”是这个接口的正常业务状态，不是服务器异常。页面上的“查询当前用户”按钮也会再次调用同一个接口。

### 3. 消费上传接口：文件本身就是请求体

选择文件后，组件直接发送 File 对象：

```ts
const response = await fetch(`/api/lab/auth/upload?filename=${encodeURIComponent(file.name)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: file,
})
```

这里不是 JSON，也不是 `multipart/form-data` 表单。`application/octet-stream` 表示请求体是二进制字节流；请求体内容就是文件原始字节，文件名则通过 URL 查询参数单独传递。浏览器同样会自动携带会话 Cookie。

插件依次检查请求方法、登录态、媒体类型、文件名和大小。全部通过后返回 `200`，响应字段是：

| 字段 | 含义 |
| --- | --- |
| `name` | 从 `filename` 中取出的最后一个路径段，并去除首尾空白 |
| `size` | 实际接收到的字节数，不信任客户端声明的长度 |
| `sha256` | 对接收到的原始字节计算的 SHA-256，以 64 个十六进制字符表示 |

组件把这三个字段显示在上传结果区域。插件不会创建上传目录、写文件或返回文件下载地址。

## 实现原理：Vite 开发服务器怎样完成这条链路

完整实现位于 `plugins/dev-server/auth-upload.ts`。下面按请求处理的顺序阅读关键部分。

### `configureServer`：把 Node 请求处理器挂进 Vite

`configureServer` 是 Vite 的开发服务器钩子，可以拿到底层中间件队列。这里的“中间件”就是依次查看 HTTP 请求、决定直接响应还是交给下一个处理器的函数。

以下为核心节选，三个接口的具体分支已省略：

```ts
export function authUploadPlugin(): Plugin {
  return {
    name: 'lab:auth-upload',
    apply: 'serve',

    configureServer(server) {
      const sessions = new Map<string, SessionUser>()

      server.middlewares.use('/api/lab/auth', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        // ……省略 /sso/callback、/session、/upload 分支……
        next()
      })
    },
  }
}
```

`sessions` 位于本次 `configureServer` 调用的闭包中：同一开发服务器实例处理的请求共享它，进程重启后它会随实例一起消失。

挂载前缀不会保留在处理器内的 `req.url` 中。例如外部请求是 `/api/lab/auth/session`，进入处理器后只需匹配 `/session`。插件因此分别判断：

- `/sso/callback`：模拟身份提供方回调并建立会话；
- `/session`：查询 Cookie 对应的用户；
- `/upload`：要求登录后接收原始字节。

已认领的分支发送响应后立即 `return`；未认领的子路径才调用 `next()`，继续交给后续中间件。所有 JSON 响应和成功回调响应都设置 `Cache-Control: no-store`，避免缓存登录态。

### 固定教学 code：只演示回调形状，不证明真实身份

回调分支的核心逻辑是：

```ts
if (url.searchParams.get('code') !== TEACHING_CODE) {
  sendJson(res, 401, { error: 'invalid_teaching_code' })
  return
}

const token = randomUUID()
sessions.set(token, { id: 'lab-user', name: 'Vite Learner' })
res.statusCode = 302
res.setHeader('Location', DEMO_RETURN_PATH)
// ……省略 Set-Cookie、Cache-Control 与响应结束……
```

这段判断只是比较一个公开常量，没有访问身份提供方、交换授权码或验证令牌签名。它适合演示“回调 → 会话 → 回跳”的控制流，不能证明访问者是谁，也不能直接改造成生产登录。

### 内存会话与 Cookie：令牌在浏览器，用户在服务端

`HttpOnly`、`SameSite` 和 `Path` 各自解决不同问题：

| Cookie 属性 | 本例中的作用 |
| --- | --- |
| `HttpOnly` | 禁止页面 JavaScript 读取 Cookie；不会阻止浏览器在请求中自动携带它 |
| `SameSite=Lax` | 限制跨站请求携带 Cookie 的场景；不是完整的跨站请求伪造（CSRF）防护 |
| `Path=/` | 允许 Cookie 随当前站点各路径的请求发送，因此 `/session` 和 `/upload` 都能收到它 |

Cookie 值是随机令牌，不是用户名或用户 ID。插件从请求头中取出令牌，再调用 `sessions.get(token)`；只有服务端 `Map` 中仍有对应记录，才算已登录。

本例没有设置 `Secure`，因为页面通过本地 HTTP 访问。也没有会话过期、注销或撤销逻辑，所以服务端没有主动使旧 Cookie 失效的途径；进程重启后，内存清空会使其对应会话失效。

### 原始字节请求体：为什么不能只读一次 `data`

Node 把请求体暴露为可读流。“流”表示字节会分批到达，而不是一次性全部进入内存。每次 `data` 事件只给出一个数据块，其类型是保存二进制字节的 `Buffer`；`end` 才表示正常接收完成，因此不能假设第一次 `data` 就包含完整文件。

上传前还有两道大小检查，上限均为 **64 KiB，即 `64 * 1024 = 65536` 字节**：

1. **声明长度提前拒绝。** `Content-Length` 是客户端声明请求体字节数的请求头。如果它是有限数值且大于 65536，立即返回 `413`，同时调用 `req.resume()` 继续消费请求数据，避免连接悬挂。
2. **实际累计字节兜底。** 没有 `Content-Length`、声明值未超过上限，或者声明值不可信时，仍逐块累加 `chunk.length`。累计值一旦超过 65536，就标记 `tooLarge` 并清空已缓存的块；后续数据继续消费但不再保存，收到 `end` 后返回 `413`。

两道检查不能互相替代：第一道可以尽早拒绝明显超限的请求，第二道才能知道实际收到了多少字节。声明值本身超过上限就会触发第一道检查，即使后续实际字节没有那么多；声明值较小也不能让实际超限内容绕过第二道检查。就实际累计字节而言，65536 不超限，达到 65537 即标记超限；但声明长度大于 65536 时，第一道检查已经先返回 `413`。

流式计数的核心节选如下，错误处理与流结束分支已省略：

```ts
const chunks: Buffer[] = []
let size = 0
let tooLarge = false

req.on('data', (chunk: Buffer) => {
  size += chunk.length
  if (size > MAX_UPLOAD_BYTES) {
    tooLarge = true
    chunks.length = 0
    return
  }
  if (!tooLarge) chunks.push(chunk)
})

// ……省略 req.on('error', next) 与 req.on('end', ...)……
```

只有流正常结束且未超限时，插件才拼接内容并计算摘要：

```ts
const content = Buffer.concat(chunks, size)
sendJson(res, 200, {
  name,
  size,
  sha256: createHash('sha256').update(content).digest('hex'),
})
```

SHA-256 是对字节内容计算的摘要，可用来核对两次计算的字节是否一致；`size` 来自实际累计值，而不是 `Content-Length`。上传内容只存在于本次请求使用的内存块中，响应后插件不再保存它。

### 文件名处理：只生成响应中的纯文件名

`getUploadName` 先读取 `filename`，按 `/` 和 `\` 分割，取最后一段并执行 `trim()`。因此 `../a.txt` 和 `C:\tmp\a.txt` 在响应中都只会得到 `a.txt`。

以下情况返回 `400` 和 `{ "error": "invalid_filename" }`：

- 没有传 `filename`，或分割、去除首尾空白后得到空字符串；
- 文件名长度大于 128；
- 包含 `U+0000–U+001F` 或 `U+007F` 控制字符。

这里只是教学用的响应名称清理，不是完整的生产文件名校验。插件不写磁盘，所以该名称也不会被拼接成存储路径。

### 接口结果对照：先拒绝哪一类错误

上传分支按“方法 → 登录态 → 媒体类型 → 文件名 → 大小”的顺序检查。例如未登录且媒体类型错误时，会先得到 `401`，而不是 `415`。

| 接口与场景 | 状态码 | 响应或关键响应头 |
| --- | --- | --- |
| `GET /sso/callback`，code 正确 | `302` | `Location` 指向演示页，设置 `vite_lab_session` Cookie |
| `/sso/callback`，code 缺失或错误 | `401` | `{ "error": "invalid_teaching_code" }` |
| `/sso/callback`，方法不是 GET | `405` | `Allow: GET`，`{ "error": "method_not_allowed" }` |
| `GET /session`，已登录 | `200` | `{ "authenticated": true, "user": { "id": "lab-user", "name": "Vite Learner" } }` |
| `GET /session`，未登录 | `200` | `{ "authenticated": false, "user": null }` |
| `/session`，方法不是 GET | `405` | `Allow: GET`，`{ "error": "method_not_allowed" }` |
| `POST /upload`，成功 | `200` | `{ "name", "size", "sha256" }` |
| `/upload`，方法不是 POST | `405` | `Allow: POST`，`{ "error": "method_not_allowed" }` |
| `POST /upload`，未登录 | `401` | `{ "error": "authentication_required" }` |
| `POST /upload`，媒体类型不是 `application/octet-stream` | `415` | `{ "error": "raw_bytes_required" }` |
| `POST /upload`，文件名无效 | `400` | `{ "error": "invalid_filename" }` |
| `POST /upload`，声明长度或实际字节超过 65536 | `413` | `{ "error": "file_too_large", "maxBytes": 65536 }` |

除 `302` 回跳外，表中的接口结果均由 `sendJson` 发送为 `application/json; charset=utf-8`，并带 `Cache-Control: no-store`。未匹配的 `/api/lab/auth` 子路径则调用 `next()`，本插件不自行生成 `404`。

## 配置接入：插件与页面分别怎样被找到

这条链路需要两处接入，缺一不可。

### 1. 把开发接口插件加入 Vite 插件数组

`plugins/dev-server/index.ts` 中的 `devServerPlugins()` 汇总本组插件，`authUploadPlugin()` 位于数组末尾：

```ts
return [
  mockApiPlugin(),
  proxyFallbackPlugin(),
  debugEndpointsPlugin(),
  authUploadPlugin(),
]
```

根 `vite.config.ts` 再把它展开进 `plugins`：

```ts
...devServerPlugins(),
```

`authUploadPlugin` 声明了 `apply: 'serve'`，也就是只在 Vite 开发服务器模式下启用。运行开发服务器时会执行 `configureServer` 并注册接口；生产构建不会注册这些 HTTP 接口，不能用构建产物代替本例的接口服务。

### 2. 把回跳路径接入 Vue Router

`src/plugin-lab/routes/dev-server.ts` 中对应的路由记录是：

```ts
{
  path: '/plugins/dev-server/auth-upload-demo',
  name: 'dev-server-auth-upload',
  component: () => import('@/views/plugins/dev-server/DevServerDemos.vue'),
  props: { scenario: 'auth-upload' },
},
```

所以 `Location` 回跳后，Vue Router 才知道要加载哪个组件；`scenario` 再让组件展示认证上传面板并查询会话。若只有插件而没有这条路由，接口仍可响应，但浏览器回跳后不会得到预期的演示面板。

## 验证步骤

下面给出可执行的验证方法和由当前源码得出的预期结果，**不表示本次文档重写已经运行过这些命令。** 命令中的 Cookie jar 和超限临时文件都位于 `/tmp`，验证后可删除。

### 1. 观察页面完整流程

启动开发服务器：

```bash
pnpm exec vite --port 5215
```

打开 <http://localhost:5215/plugins/dev-server/auth-upload-demo>。

预期结果：

1. 未建立会话时显示“当前未登录”。
2. 点击“模拟 SSO 登录”后，地址回到 `/plugins/dev-server/auth-upload-demo?login=success`，页面显示 `Vite Learner（lab-user）`。
3. 选择不超过 64 KiB 的文件并点击“上传原始字节”，结果区域显示清理后的 `name`、实际 `size` 和 `sha256`。
4. 选择大于 64 KiB 的文件，页面显示“文件超过 65536 字节限制。”。
5. 重启开发服务器后再刷新页面，旧 Cookie 找不到内存会话，页面恢复为“当前未登录”。

### 2. 用 curl 观察 302、Cookie、会话和成功上传

先看不带 Cookie 的会话响应：

```bash
curl -i http://localhost:5215/api/lab/auth/session
# 预期：HTTP 200
# {"authenticated":false,"user":null}
```

请求有效回调，并用 `-c` 保存 Cookie。这里不要加 `-L`，这样才能直接观察 `302`：

```bash
curl -i -c /tmp/vite-lab-cookies.txt \
  'http://localhost:5215/api/lab/auth/sso/callback?code=vite-lab-teaching-code'
# 预期：HTTP 302
# Location: /plugins/dev-server/auth-upload-demo?login=success
# Set-Cookie 包含 vite_lab_session=<随机 UUID>、HttpOnly、SameSite=Lax、Path=/
```

再用 `-b` 带上同一个 Cookie jar：

```bash
curl -i -b /tmp/vite-lab-cookies.txt \
  http://localhost:5215/api/lab/auth/session
# 预期：HTTP 200
# {"authenticated":true,"user":{"id":"lab-user","name":"Vite Learner"}}
```

上传不含换行的 10 字节内容 `hello vite`：

```bash
printf 'hello vite' | curl -i -b /tmp/vite-lab-cookies.txt \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @- \
  'http://localhost:5215/api/lab/auth/upload?filename=hello.txt'
# 预期：HTTP 200；name 为 hello.txt，size 为 10
# sha256 是对这 10 个原始字节计算出的 64 个十六进制字符
```

如需对照摘要，可在本地计算同一输入：

```bash
printf 'hello vite' | shasum -a 256
# 预期：输出的摘要与上传响应中的 sha256 相同
```

### 3. 观察拒绝分支与检查顺序

错误教学 code：

```bash
curl -i \
  'http://localhost:5215/api/lab/auth/sso/callback?code=wrong-code'
# 预期：HTTP 401
# {"error":"invalid_teaching_code"}
```

对只接受 GET 的 session 接口使用 POST：

```bash
curl -i -X POST http://localhost:5215/api/lab/auth/session
# 预期：HTTP 405，Allow: GET
# {"error":"method_not_allowed"}
```

不带 Cookie 上传，即使其他参数正确也会先被拒绝：

```bash
printf 'x' | curl -i \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @- \
  'http://localhost:5215/api/lab/auth/upload?filename=x.txt'
# 预期：HTTP 401
# {"error":"authentication_required"}
```

带有效 Cookie、但使用错误媒体类型：

```bash
printf 'x' | curl -i -b /tmp/vite-lab-cookies.txt \
  -H 'Content-Type: text/plain' \
  --data-binary @- \
  'http://localhost:5215/api/lab/auth/upload?filename=x.txt'
# 预期：HTTP 415
# {"error":"raw_bytes_required"}
```

带有效 Cookie、但缺少文件名：

```bash
curl -i -b /tmp/vite-lab-cookies.txt \
  -X POST -H 'Content-Type: application/octet-stream' \
  --data-binary '' \
  'http://localhost:5215/api/lab/auth/upload'
# 预期：HTTP 400
# {"error":"invalid_filename"}
```

### 4. 分别观察两种 413 触发路径

先让 curl 从一个真实的 65537 字节临时文件得到请求长度，从而触发声明长度检查：

```bash
node -e 'require("node:fs").writeFileSync("/tmp/vite-lab-too-large.bin", Buffer.alloc(65537))'
curl -i -b /tmp/vite-lab-cookies.txt \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @/tmp/vite-lab-too-large.bin \
  'http://localhost:5215/api/lab/auth/upload?filename=too-large.bin'
# 预期：HTTP 413
# {"error":"file_too_large","maxBytes":65536}
rm /tmp/vite-lab-too-large.bin
```

再用分块传输（chunked）发送同样的字节，不依赖预设的 `Content-Length`，观察实际累计字节检查：

```bash
node -e 'process.stdout.write(Buffer.alloc(65537))' | curl -i \
  -b /tmp/vite-lab-cookies.txt \
  -H 'Content-Type: application/octet-stream' \
  -H 'Transfer-Encoding: chunked' \
  --data-binary @- \
  'http://localhost:5215/api/lab/auth/upload?filename=too-large.bin'
# 预期：流接收完成后返回 HTTP 413
# {"error":"file_too_large","maxBytes":65536}
```

若把 65537 改为 65536，且其他条件不变，预期不再因大小被拒绝；成功响应中的 `size` 应为 65536。

## 进阶参考：教学流程离生产还有多远

> 现成方案与自研边界见文首「现成方案速览」，下面只讨论本例没有覆盖的部分。

::: details 固定 code 不是真实 SSO，生产 OIDC/OAuth 还需要什么

- 真实 OIDC/OAuth 回调必须与身份提供方交互，校验 `state`、`nonce`、授权码单次使用、PKCE、重定向 URI、issuer/audience、令牌签名与有效期，并安全交换和存储令牌。本例没有做其中任何一项。
- 生产会话需要过期、注销、撤销和审计，回跳地址需要白名单；还要防范 CSRF 与登录 CSRF。`SameSite=Lax` 不能替代完整防护。
- HTTPS 环境应设置 `Secure` Cookie，并按实际威胁模型设计 Cookie 域、路径和跨站属性。本例为了本地 HTTP 教学没有设置 `Secure`。
- 内存 `Map` 只服务当前开发进程：重启即丢失会话，也没有跨进程共享能力。旧 Cookie 不会因重启自动从浏览器消失，但已经无法通过服务端会话校验。

:::

::: details 原始字节接口不是生产上传服务

- 真实表单上传通常使用经过验证的 multipart 解析器，不能把本例的 `body: file` 接口直接当作 multipart 服务。
- 生产实现还需流式大小与超时限制、文件名和 MIME/实际内容检查、鉴权授权、恶意文件扫描、配额、持久化与加密安全存储、访问控制和清理策略。
- 本例的名称清理只影响 JSON 响应，不提供存储安全保证；也没有扩展名白名单、内容识别或病毒扫描。
- SHA-256 只用于核对原始字节摘要，不代表文件可信、安全或已获得访问授权。
- 上传字节不会写入磁盘，插件只返回元信息和摘要；需要真实存储时，应重新设计流式处理与失败清理，而不是先无上限地拼接在内存中。

:::

插件钩子基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
