---
name: innocenz-r2-buckets
description: "Cloudflare R2 — two buckets (innocenz = prod, innocenz-staging = local), the live key layout, and the token/public-URL traps"
metadata: 
  node_type: memory
  type: reference
  originSessionId: b5f17b42-7efb-4d5c-88da-5e4207c57979
  modified: 2026-08-10T02:23:14.365Z
---

Cloudflare dashboard: https://dash.cloudflare.com — account **uab.innocenz@gmail.com**
(account id `f5439ba6508818eb080c7addb7d9bfc4`). Password is NOT stored here on purpose —
keep it in the password manager.

Two R2 buckets:

- **`innocenz`** — the real one behind innocenz.net. Public Access **Enabled**. Holds the
  only live objects so far (profile/ID/comcard/portfolio + agency & outlet logos). No PV,
  receipt or OCR files yet.
- **`innocenz-staging`** — what local dev points at (`R2_BUCKET_NAME` in the repo-root
  `.env`). **Empty.**

**Live key layout** (verified by listing `innocenz`, 10 Aug 2026 — copy this shape for every
new artifact type):

```
agency/<agencyId>/logo/logo-<epochMs>.<ext>
outlet/<outletId>/logo/logo-<epochMs>.<ext>
user/<userId>/profile/avatar-<epochMs>.jpg
user/<userId>/id-docs/id-front-<epochMs>.jpeg
user/<userId>/id-docs/id-back-<epochMs>.jpeg
user/<userId>/comcard/comcard-<epochMs>.png
user/<userId>/portfolio/slot-<n>-<epochMs>.jpg
```

Two traps that both silently break local uploads:

1. **The `.env` R2 token cannot touch `innocenz-staging`.** LIST and PUT both return
   `AccessDenied`; the same token has full list/put/get/delete on `innocenz`. So with
   `R2_BUCKET_NAME=innocenz-staging` every local image upload fails — that is why the
   staging bucket is empty. Fix is in the Cloudflare dashboard (R2 → API tokens): issue a
   token whose scope includes `innocenz-staging`.
2. **`R2_PUBLIC_URL` does not serve `innocenz`.** Fetching a key that exists in `innocenz`
   through `pub-de7cd6ffba534ee480e253160c53a30c.r2.dev` returns 404. Each bucket has its
   own r2.dev domain — the public URL must match whichever bucket `R2_BUCKET_NAME` writes
   to, or images upload fine and then 404 on display.

Probe scripts: `apps/backend/src/scripts/_probe-r2-list.ts` (list one bucket; override with
`$env:R2_BUCKET_NAME`) and `_probe-r2-staging.ts` (write test on both + public-URL check).

See [[innocenz-deploy-blockers]] and [[innocenz-env-gotchas]].
