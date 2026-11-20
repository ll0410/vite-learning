# 17. 模拟 SSO 登录回调与文件上传

## 教学会话流程

`plugins/dev-server/auth-upload.ts` 提供三个开发期接口：

1. `GET /api/lab/auth/sso/callback?code=vite-lab-teaching-code` 只接受固定教学 code，成功后在内存中创建随机会话，设置 `vite_lab_session` Cookie，并以 `302` 回跳到 `/plugins/dev-server/auth-upload-demo?login=success`。错误 code 返回 `401`。
2. `GET /api/lab/auth/session` 根据 Cookie 返回 `{ authenticated, user }`，未登录不是服务器错误。
3. `POST /api/lab/auth/upload?filename=...` 要求已登录且 Content-Type 为 `application/octet-stream`，请求体直接是文件原始字节。

Cookie 带 `HttpOnly; SameSite=Lax; Path=/`，会话和上传内容都只保存在进程内存中。上传限制为 **64 KiB**；声明长度或实际累计字节超限均返回 `413` 和 `maxBytes`。成功响应包含去掉目录部分后的 `name`、实际 `size` 和基于原始字节计算的 `sha256`。不会创建上传目录、写磁盘或连接外部身份服务。

## 页面与 HTTP 验证

```bash
pnpm exec vite --port 5215
```

打开 <http://localhost:5215/plugins/dev-server/auth-upload-demo>，点击“模拟 SSO 登录”，回跳后查询当前用户；选择不超过 64 KiB 的文件上传并查看哈希。选择更大的文件会得到明确的超限错误。

使用 Cookie jar 验证完整流程：

```bash
curl -i -c /tmp/vite-lab-cookies.txt \
  'http://localhost:5215/api/lab/auth/sso/callback?code=vite-lab-teaching-code'
# 302；Location 指向示例页；Set-Cookie 包含 HttpOnly / SameSite=Lax

curl -s -b /tmp/vite-lab-cookies.txt \
  http://localhost:5215/api/lab/auth/session
# {"authenticated":true,"user":{"id":"lab-user","name":"Vite Learner"}}

printf 'hello vite' | curl -s -b /tmp/vite-lab-cookies.txt \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @- \
  'http://localhost:5215/api/lab/auth/upload?filename=hello.txt'
# 返回 name=hello.txt、size=10 和对应的 SHA-256
```

可用下面的命令验证超限响应：

```bash
node -e 'process.stdout.write(Buffer.alloc(65537))' | curl -i \
  -b /tmp/vite-lab-cookies.txt -H 'Content-Type: application/octet-stream' \
  --data-binary @- 'http://localhost:5215/api/lab/auth/upload?filename=too-large.bin'
# HTTP 413，maxBytes=65536
```

## 生产安全差距

**固定 code 不是 SSO。** 真实 OIDC/OAuth 回调必须实现并校验 `state`、`nonce`、授权码单次使用、PKCE、重定向 URI、 issuer/audience、令牌签名与有效期，并安全交换和存储令牌。还需要 Secure Cookie（本地 HTTP 示例无法启用）、会话过期/撤销、CSRF 与登录 CSRF 防护、回跳地址白名单和审计。

**原始字节接口不是生产上传服务。** 真实表单上传应使用经过验证的 multipart 解析器，实施流式大小/超时限制、文件名与 MIME/内容检查、鉴权授权、恶意文件扫描、配额、持久化与加密安全存储、访问控制和清理策略。SHA-256 只用于本例核对字节完整性，不代表文件安全。

插件使用 `apply: 'serve'`，构建不会注册这些接口。进程重启即丢失教学会话，上传字节随请求结束释放。

```bash
pnpm build
pnpm docs:build
git diff --check
```

相关基础见 [ch10 插件机制](../../guide/ch10-plugins.md)。
