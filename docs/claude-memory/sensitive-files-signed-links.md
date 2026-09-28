---
name: sensitive-files-signed-links
description: "Since 28 Sep 2026 ID-card, receipt, MC, dispute and signed-voucher files leave the API as 1-hour SIGNED links, may live in a private R2 bucket (R2_PRIVATE_BUCKET_NAME), and signed links sent back are turned into keys"
metadata:
  node_type: memory
  type: project
  originSessionId: 9b91b63a-a374-4bab-8706-1adf2e265fbb
  modified: 2026-09-28T05:47:22.166Z
---

`util/r2.ts` `isSensitiveR2Key`: `user/<1-2 segs>/(ic-docs|id-docs|receipts|leave|disputes|pv)/…`.
Every `/api/v1` JSON response passes `middlewares/sign-private-files.ts` (mounted BEFORE
`platformAuditMiddleware`, so the audit keeps plain keys), which swaps those keys — and legacy full
public URLs to them — for signed GET links (`R2_SIGNED_URL_TTL_SECONDS`, default 3600), one link
per key per response. Avatars, portfolio, comcards and logos stay on the public address.

Inputs: `r2KeyFromSignedUrl` turns a link we issued back into its key in `saveProofPhotosToR2`
and the MC upload — without it an edit would store an expiring URL and its cleanup would DELETE
the object. `/img/users/ic-docs|id-docs` (the no-R2 disk fallback) now 404s.

**Still owed by the user:** create a private bucket (public access OFF), scope the R2 token to
both buckets, run `src/scripts/_move-sensitive-r2-objects.ts` (dry run → `--copy` → set
`R2_PRIVATE_BUCKET_NAME` + restart → `--copy` again → `--delete-public`). Until then the OLD public
links still open while the bucket is public.

Related: [[innocenz-r2-buckets]], [[shared-db-writes-need-the-user]].
