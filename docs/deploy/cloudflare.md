# Cloudflare Workers and R2

This page covers what happens after a successful Cloudflare Workers deploy: how
tokens differ, how to attach an R2 bucket as file storage, how capacity relates
to user quotas, and how to serve ZPan on a domain you already manage in
Cloudflare.

The GitHub Actions workflow itself is described in the [README](../../README.md#cloudflare-workers-recommended).
Image-hosting customer hostnames are a different feature — see
[Image custom domains](../image-custom-domains.md). Dedicated WebDAV hostnames
are covered in [WebDAV custom domains](../webdav-custom-domain.md).

## Three different Cloudflare credentials

These are easy to mix up. They are not interchangeable.

| Credential | Where you create it | Where you paste it | What it is for |
| --- | --- | --- | --- |
| **Deployment API token** | [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) | GitHub **Settings → Secrets → `CLOUDFLARE_API_TOKEN`** | Deploy the Worker, D1, KV, queues, and the avatar/logo R2 bucket |
| **R2 S3 API token** | R2 → **Manage R2 API Tokens** | ZPan **Admin → Storages** (Access Key + Secret Key) | Browser uploads and downloads against your **file** bucket |
| **Image custom-domain token** | Zone-scoped token from the Admin Settings drawer | **Admin → Settings → Image custom domains** | Cloudflare for SaaS hostnames for the image bed only |

The deployment token cannot be pasted into Admin → Storages. Storages needs the
S3-compatible **Access Key ID** and **Secret Access Key** from an R2 API token.

R2 API token secrets are shown **once** at creation time. If you did not copy
the secret, revoke that token and create a new one. Rotating the GitHub
`CLOUDFLARE_API_TOKEN` and re-running deploy does not create or recover an S3
Access Key.

## What deploy provisions automatically

A successful **Deploy to Cloudflare Workers** run:

- Deploys the `zpan` Worker (typically at `https://zpan.<account>.workers.dev`)
- Creates or reuses D1 (`zpan-db`) and optional Cache KV
- Creates or reuses the **`zpan-public-images`** R2 bucket for avatars and logos
- Does **not** create a user-file bucket and does **not** add a row under
  Admin → Storages

File storage is always configured in the running app after you register the
first admin user.

## Attach Cloudflare R2 as file storage

### 1. Create the file bucket

In the Cloudflare dashboard: **R2 → Create bucket**. The bucket name is
arbitrary (for example `zpan`). This is separate from `zpan-public-images`.

### 2. Create an R2 S3 API token

**R2 → Manage R2 API Tokens → Create**. Prefer **Object Read & Write** scoped
to that one bucket rather than account-wide Admin Read & Write. Copy both:

- Access Key ID
- Secret Access Key

### 3. Set bucket CORS

Because the browser uploads directly to R2 with presigned URLs, the **file**
bucket needs CORS for every origin people use to open ZPan.

Bucket → **Settings → CORS policy**:

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

Add your custom domain later (see [Custom domain](#custom-domain)). After you
save a storage in ZPan, **Test** on the Storages page also prints a CORS JSON
snippet if the browser is blocked.

### 4. Fill Admin → Storages

Open ZPan as the first registered user (that account is admin) and go to
**Admin → Storages → Add**.

| Field | What to enter |
| --- | --- |
| **Provider** | Type a label such as `cloudflare-r2`. The dropdown is fed by [eplist](https://github.com/eplist/eplist) and does **not** include R2. The field is a display name; it does not change how ZPan talks to S3. |
| **Bucket** | The R2 bucket name, e.g. `zpan` |
| **Endpoint** | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| **Region** | `auto` |
| **Access Key / Secret Key** | The R2 S3 API token from step 2 |
| **Force path style** | Leave **on** (default). R2 is addressed as `endpoint/bucket/key`. |

Save, then run **Test**. A healthy result means the Worker can sign requests and
the browser can PUT/GET against the bucket.

## Capacity, quotas, and traffic billing

These are ZPan controls. They are not Cloudflare R2 billing.

### Storage backend capacity (the bucket)

On **Admin → Storages**, open **Capacity & billing** for that backend.

- **Available space `0`**: ZPan does not enforce a backend ceiling. This is the
  usual setting for a personal instance.
- A positive value (for example `500` + `GB`) is a **soft cap** for that
  backend. New writes stop when used + reserved bytes would exceed it.

This number is not synced from R2's real remaining space. Cloudflare still
bills R2 usage from the R2 dashboard.

### Workspace quotas (users and teams)

Quotas limit how much each workspace may store, independent of the backend cap.

- **Admin → Settings → default quota / default team quota**: initial grant for
  new personal and team workspaces.
- **Admin → Users → (user) → grant entitlement**: extra storage for one
  existing workspace.

Users hit quota first. The backend capacity is a second, instance-wide brake.

### Traffic Credits billing

**Egress Credits billing** on a storage deducts workspace Credits for download
traffic from that backend. It requires the quota store (Business). Leave it
**off** for personal use. It does not pay your Cloudflare invoice.

## Custom domain

You can serve ZPan on a hostname in a Cloudflare zone you already own (for
example `drive.example.com`). This is a **Worker Custom Domain**. It is not an
R2 public bucket URL, and it is not the image-hosting custom-domain feature.

Suggested order: attach the hostname → set `BETTER_AUTH_URL` → set Public URL →
update R2 CORS → sign in on the new origin and test an upload.

### 1. Attach a Worker Custom Domain

1. Cloudflare dashboard → **Workers & Pages** → Worker **`zpan`**
2. **Settings → Domains & Routes → Add → Custom Domain**
3. Enter a hostname whose zone is on this Cloudflare account, e.g.
   `drive.example.com`

Cloudflare provisions DNS and TLS for that hostname.

### 2. Set `BETTER_AUTH_URL`

This Worker secret is the canonical origin for login cookies and OAuth
callbacks. After you add a custom domain, point it at that origin.

**Dashboard**

1. **Workers & Pages** → **`zpan`** → **Settings → Variables and Secrets**
2. Add or edit the **Secret** named `BETTER_AUTH_URL`
3. Value: `https://drive.example.com` (scheme + host, no trailing slash)
4. Save / deploy so the Worker picks up the new secret

**CLI** (from a checkout with Wrangler authenticated):

```bash
echo "https://drive.example.com" | pnpm exec wrangler secret put BETTER_AUTH_URL
```

If you still open the old `*.workers.dev` URL after this change, login may fail
because cookies were issued for the custom origin. Use the custom domain as the
canonical URL. To allow extra origins (for example keeping `workers.dev` as a
fallback), set the Worker secret `TRUSTED_ORIGINS` to a comma-separated list of
origins.

### 3. Set Public URL in Admin

In **Admin → Settings**, set **Public URL** to the same origin
(`https://drive.example.com`). ZPan uses it for absolute links in shares and
email. Leave it blank only if you want the value inferred from each request.

### 4. Add the origin to R2 CORS

Edit the file bucket CORS `AllowedOrigins` so it includes the custom origin.
You can keep `workers.dev` during cutover:

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

If **Test** on Storages reports a CORS failure, paste the JSON the UI shows
into this policy. The generated snippet uses the origin you are currently
browsing.

## Existing objects in the bucket (including Cloudreve)

ZPan's file tree lives in D1 (`matters` rows with `object` keys and
`storage_id`). Attaching an R2/S3 bucket that already contains files does
**not** list those objects into the Files UI.

There is no built-in Cloudreve v3/v4 importer. A future importer would need to
map Cloudreve database records (or, less faithfully, `ListObjects`) onto
`storages` + `matters`. Local-disk Cloudreve policies would also need the bytes
copied into the S3/R2 bucket first.

## Related

- [Image custom domains](../image-custom-domains.md)
- [WebDAV custom domains](../webdav-custom-domain.md)
- [Spaces, quota, and sharing](../design/spaces-quota-sharing.md)
