---
name: admin-pages-not-role-gated
description: "Observed 2026-07-20: an agency-role token could load admin pages and read admin data — possible authorization gap, NOT caused by the schema work"
metadata: 
  node_type: memory
  type: project
  originSessionId: b687fb8d-84de-4f81-8e3f-e7c353c2a893
  modified: 2026-07-20T09:24:30.557Z
---

While browser-verifying the schema reshape on 2026-07-20 I signed in as **`owner@atlas-agency.my`** (agency role only — the only `admin`-role users are `innocenz@gmail.com` and `jinkgan48@gmail.com`) and navigated straight to admin routes:

- `/en/admin/user-management/pr` — rendered the full PR list with data
- `/en/admin/service/other` — rendered all special-service orders
- `/en/admin/business/plan` — rendered the plan catalog
- `/en/admin/user-management/outlet` / `/agency` — rendered org lists and detail sheets

The header even displayed the agency owner's name next to the role chip "agency" while showing admin screens. The backend also served `/api/v1/user`, `/api/v1/subscription`, `/api/v1/special-service` and `/api/v1/outlet` to that agency token.

**This is pre-existing and NOT caused by the table reshape** (migrations 0030–0036) — those changed columns and table names, never route guards. It may also be intentional in dev, or the routes may rely on a guard that the injected-token path bypassed (the token was injected into localStorage rather than going through the sign-in flow, so any identity resolution done at sign-in did not run).

**Why:** worth a deliberate check before production; an agency operator reading the whole platform's PR roster, plan catalog and every outlet's orders would be a real tenancy leak.

**How to apply:** confirm first whether `requireAdmin` is applied to these routers (`agency.routes.ts` uses it only on approve/suspend) and whether the admin frontend routes have a role guard. Compare against the `resolveScope` tenant-scoping pattern in [[backend-migrations-shared-db]]. Do not assume it is broken until reproduced through a normal sign-in.
