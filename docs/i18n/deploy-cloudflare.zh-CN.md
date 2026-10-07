# Cloudflare Workers 与 R2

本文说明 Cloudflare Workers 部署成功之后怎么继续：几类 Token 的区别、如何把 R2 桶挂成网盘存储、容量/配额/计费分别管什么，以及如何用你已经放在 Cloudflare 下的域名访问 ZPan。

部署工作流本身见 [README（简体中文）](README.zh-CN.md#cloudflare-workers推荐)。图床客户域名是另一项功能，见 [Image custom domains](../image-custom-domains.md)。WebDAV 独立域名见 [WebDAV custom domains](../webdav-custom-domain.md)。

英文原文：[Cloudflare Workers and R2](../deploy/cloudflare.md)。

## 三种 Cloudflare 凭证不要混用

| 凭证 | 在哪创建 | 填到哪里 | 用途 |
| --- | --- | --- | --- |
| **部署用 API Token** | [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) | GitHub **Settings → Secrets → `CLOUDFLARE_API_TOKEN`** | 部署 Worker、D1、KV、队列，以及头像/Logo 用的 R2 桶 |
| **R2 S3 API Token** | R2 → **Manage R2 API Tokens** | ZPan **Admin → Storages**（Access Key + Secret Key） | 浏览器对**用户文件桶**做预签名上传/下载 |
| **图床自定义域名 Token** | 管理后台抽屉里给出的 Zone 级 Token | **Admin → Settings → Image custom domains** | 仅用于图床的 Cloudflare for SaaS 主机名 |

部署 Token **不能**填进 Admin → Storages。Storages 需要的是 R2 API Token 的 S3 兼容 **Access Key ID** 和 **Secret Access Key**。

R2 API Token 的 Secret **只在创建时显示一次**。没复制过就只能吊销再建。更新 GitHub 的 `CLOUDFLARE_API_TOKEN` 再跑部署，**不会**生成或找回 S3 Access Key。

## 部署会自动建什么

一次成功的 **Deploy to Cloudflare Workers**：

- 部署 `zpan` Worker（一般是 `https://zpan.<账号>.workers.dev`）
- 创建或复用 D1（`zpan-db`）和可选的 Cache KV
- 创建或复用 **`zpan-public-images`** 桶（头像、Logo）
- **不会**创建用户文件桶，也 **不会**在 Admin → Storages 里自动加一条存储

文件存储要在注册完第一个管理员之后，在运行中的实例里手动添加。

## 把 Cloudflare R2 挂成网盘存储

### 1. 创建文件桶

Cloudflare 控制台：**R2 → Create bucket**。桶名任意（例如 `zpan`）。这和 `zpan-public-images` 不是同一个桶。

### 2. 创建 R2 S3 API Token

**R2 → Manage R2 API Tokens → Create**。建议权限用 **Object Read & Write**，并限定到这一个桶，而不是账号级 Admin Read & Write。创建后立刻复制：

- Access Key ID
- Secret Access Key

### 3. 给桶配 CORS

浏览器会用预签名 URL **直传 R2**，所以文件桶必须允许人们打开 ZPan 时用到的每一个 origin。

桶 → **Settings → CORS policy**：

```json
[
  {
    "AllowedOrigins": [
      "https://zpan.YOUR_SUBDOMAIN.workers.dev"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

自定义域名加上之后，把新 origin 也写进 `AllowedOrigins`（见 [自定义域名](#自定义域名)）。在 ZPan 里保存存储后点 **Test**，若被浏览器 CORS 拦住，页面也会给出一份可粘贴的 CORS JSON。

### 4. 填写 Admin → Storages

用第一个注册用户登录（该账号即管理员），打开 **Admin → Storages → 添加**。

| 字段 | 填什么 |
| --- | --- |
| **提供商** | 手填标签即可，例如 `cloudflare-r2`。下拉列表来自 [eplist](https://github.com/eplist/eplist)，**没有** R2。该字段只是显示名，不改变 ZPan 的 S3 协议行为。 |
| **Bucket** | R2 桶名，例如 `zpan` |
| **Endpoint** | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| **Region** | `auto` |
| **Access Key / Secret Key** | 第 2 步的 R2 S3 API Token |
| **Force path style** | 保持开启（默认）。R2 使用 `endpoint/bucket/key` 路径样式。 |

保存后点 **Test**。通过即表示 Worker 能签名，且浏览器能对桶 PUT/GET。

## 容量、配额、流量计费

这些都是 **ZPan 自己的运营开关**，不是 Cloudflare R2 账单。

### 存储后端容量（整个桶）

在 **Admin → Storages** 对该后端打开 **容量与计费**。

- **可用空间 `0`**：ZPan 不限制该后端上限。个人实例通常这样设。
- 填正数（例如 `500` + `GB`）是该后端的**软上限**；已用 + 预留超过后会拒写。

这个数字 **不会** 同步 R2 真实剩余空间。Cloudflare 侧用量仍看 R2 控制台。

### 工作空间配额（用户 / 团队）

配额限制每个工作空间能存多少，和后端容量是两层。

- **Admin → Settings → 默认配额 / 团队默认配额**：新建个人/团队空间的初始额度。
- **Admin → Users →（某个用户）→ 发放额度**：给已有空间加存储。

用户会先撞配额；后端容量是整站第二道刹车。

### 流量 Credits 计费

存储上的 **流量 Credits 计费** 会按该后端的下载流量扣工作区 Credits，需要配额商店（Business）。个人自用请保持 **关闭**。它不会替你付 Cloudflare 账单。

## 自定义域名

可以把 ZPan 挂到你已经放在 Cloudflare 的域名上（例如 `drive.example.com`）。这是 **Worker Custom Domain**，不是 R2 公共桶域名，也不是图床自定义域名。

建议顺序：绑好主机名 → 改 `BETTER_AUTH_URL` → 改对外访问地址 → 更新 R2 CORS → 用新域名登录并试一次上传。

### 1. 绑定 Worker Custom Domain

1. Cloudflare 控制台 → **Workers & Pages** → Worker **`zpan`**
2. **Settings → Domains & Routes → Add → Custom Domain**
3. 填一个已在本账号托管的主机名，例如 `drive.example.com`

Cloudflare 会为该主机名签发 DNS 和 TLS。

### 2. 修改 `BETTER_AUTH_URL`

这个 Worker Secret 是登录 Cookie 和 OAuth 回调的规范 origin。加上自定义域名后，应改成该地址。

**控制台**

1. **Workers & Pages** → **`zpan`** → **Settings → Variables and Secrets**
2. 新增或编辑名为 `BETTER_AUTH_URL` 的 **Secret**
3. 值：`https://drive.example.com`（含 scheme 和主机名，不要末尾 `/`）
4. 保存 / 部署，让 Worker 加载新 Secret

**命令行**（已登录 Wrangler 的仓库目录）：

```bash
echo "https://drive.example.com" | pnpm exec wrangler secret put BETTER_AUTH_URL
```

改完后如果还用原来的 `*.workers.dev` 打开，登录可能失败，因为 Cookie 是按自定义域名签发的。请把自定义域名当作规范地址。若还要同时兼容 `workers.dev`，把 Worker Secret `TRUSTED_ORIGINS` 设成逗号分隔的多个 origin。

### 3. 在管理后台填写对外访问地址

**Admin → Settings** 里把 **对外访问地址（Public URL）** 设成同一 origin（`https://drive.example.com`）。分享页和邮件里的绝对链接用这个值。只有希望按每次请求自动识别时才留空。

### 4. 把新 origin 加进 R2 CORS

编辑文件桶 CORS 的 `AllowedOrigins`。切换期间可以同时保留 `workers.dev`：

```json
[
  {
    "AllowedOrigins": [
      "https://zpan.YOUR_SUBDOMAIN.workers.dev",
      "https://drive.example.com"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

若 Storages 的 **Test** 报 CORS 失败，把页面给出的 JSON 贴进这项策略即可。那段 JSON 会按你当前访问的 origin 生成。

## 桶里已有对象（含 Cloudreve）

ZPan 的文件树在 D1 的 `matters` 里（含 `object` key 和 `storage_id`）。把已经有文件的 R2/S3 桶挂上，**不会**把对象扫进「文件」页面。

管理员可用 `POST /api/site/storages/{id}/import-objects`（默认 dry-run）把已有 S3/R2 对象键导入文件树，适用于 Cloudreve 等已把文件放在兼容 S3 存储里的场景。完整的 Cloudreve v3/v4 库表导入（用户/元数据映射）仍是后续工作。本地磁盘策略仍需先把字节拷进 S3/R2。

## 相关文档

- [Image custom domains](../image-custom-domains.md)
- [WebDAV custom domains](../webdav-custom-domain.md)
- [Spaces, quota, and sharing](../design/spaces-quota-sharing.md)
