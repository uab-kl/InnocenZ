---
name: innocenz-deploy-blockers
description: innocenz.net deploy waits on Junyu (shared server) and iOS review; build file-upload against innocenz-staging locally in the meantime
metadata: 
  node_type: memory
  type: project
  originSessionId: b5f17b42-7efb-4d5c-88da-5e4207c57979
  modified: 2026-08-10T02:23:39.149Z
---

As of 10 Aug 2026, production (**innocenz.net**, the `innocenz` R2 bucket) is **not** the
place to build against:

- Deploy is gated on **Junyu** — that server is shared with another project's web app, so
  releases are not the user's to schedule.
- **iOS** is waiting too: the App Store submission needs a lot more information before it
  can go.
- Production has profile pictures only. **No PV, receipt, or OCR files have ever been
  uploaded.**

**Why:** the work can't be validated in prod, and prod's bucket holds real data — so
experimenting there is both blocked and unsafe.

**How to apply:** do all file-upload work locally against **`innocenz-staging`**, mirroring
the key layout already proven in `innocenz` (see [[innocenz-r2-buckets]]). The intended
scope, in the user's words: PV, OCR, any receipt, the profile picture taken at register, PR
gallery, extra photos, and proof photos for receipts — with the R2 path driven from `.env`
rather than hardcoded. Establish and confirm the path scheme *before* writing upload code.
When Junyu's deploy window opens, the same scheme points at `innocenz` by swapping
`R2_BUCKET_NAME` + `R2_PUBLIC_URL`.
