---
name: ungated-router-sweep
description: "Full audit of all 25 backend routers for missing role gates (28 Jul 2026) — what was fixed, what is still open, and who owns each remainder"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2767147f-8f41-4a7e-88f8-868be9d52d72
  modified: 2026-07-30T09:28:55.585Z
---

Swept every `apps/backend/src/features/**/*.routes.ts` (25 routers) for endpoints with no authorization beyond `authenticateJWT`. **Nothing found was ever exploited** — verified against `main.audit_logs` and `created_by` stamps.

**Fixed and committed (branch SL):**
- `5e35455` — `GET /rating` gated + tenancy-scoped (outlet→own venues via `rating.outlet_id`; agency→own PRs via `pr.agency_id`, since `rating.pr_id` is deliberately not a FK). `POST /rating` now checks the body's `outletId` against the caller's outlets.
- `c629d39` — **the important one.** `POST|PUT|DELETE /{agency,outlet}/:id/members` had no gate and `addMember` trusts `userId`+`subRole` from the body. Membership IS identity: one POST made any account an active owner of any org, defeating every `requireAgencySubRole`/`requireOutletSubRole` guard and `resolveOrgScope`. Now admin-only. Also gated `special-service` `assign`+`status` to admin, and stopped `create` trusting `initiatedBy` (it decides whether a post needs admin review).

**Still open — see [[outlet-agency-gaps]] and [[app-foundation-gaps]]:**
| Item | Severity | Lane |
|---|---|---|
| `member-subscription` — all 6 endpoints open, no scoping; any account can create/update/cancel any subscription and read platform-wide revenue. Frontend only ever GETs; writes have zero callers | HIGH | jk (Admin) |
| `outlet-transaction` — all 4 endpoints open, no scoping, **zero callers anywhere** in web or mobile | HIGH | jk (Admin) |
| ~~outlet half~~ **CLOSED 28 Jul 2026** — `GET /outlet`, `/:id`, `/memberships`, `/geocode`, `/:id/geocode` → `requireRole('admin','agency','outlet')`; `POST /outlet` → `requireAdmin`. Live-verified on :7777: agency 200, outlet-owner 200, anonymous 401, `POST` 403. PR exclusion is safe — all 6 `pr` users hold **only** the `pr` role, and apps/mobile calls no `/outlet` route (only `/outlet-swap/mine`) | — | SL (done) |
| `GET /agency`, `/agency/:id`, `/memberships`, `/pr-links`, `POST /agency` — agency half still open | MEDIUM | shared |
| `GET /user` list open | ~~MEDIUM~~ **CRITICAL** | jk (Admin) |
| `subscription` + `commission-config` reads open (writes are admin) | LOW | jk; commission_config is slated to be dropped |

**Trap on `GET /user`:** it cannot take a flat role gate. Admin (`services/admin/admins.ts`) and agency (`services/pr/prs.ts`) call the list, but **mobile calls `GET /user/:id` for the signed-in PR** (`apps/mobile/src/lib/api.ts:229`). Excluding PR breaks mobile — it needs self-or-privileged scoping like `rating` got. The `user` write paths are already correct (`actorId !== id → 403`).

**⚠ SEVERITY WAS WRONG — this is CRITICAL, not MEDIUM. See [[user-list-hash-leak]].** The scoping
analysis above is right and still stands; what nobody checked was **the response body**. `list()`
has no projection, so the open list ships **`passwordHash` for every account** plus IC/DOB/address
from `user_profile`. Confirmed live 30 Jul on pr, outlet and agency tokens. **The projection fix is
separate from, and more urgent than, the scoping fix** — do it first; it breaks no caller.

**Verified clean, do not re-audit:** `outlet-swap /mine/*` (self-scopes via `resolveCallerPr`/`resolveOwnPendingSwap`), `payment-voucher /mine/*` (sit above the `requireRole('admin','agency')` seam at line 25), the five `rbac` routers, `pr`, `shift`, `shift-sale`, `shift-assignment`, `outlet-workspace`. `health`/`auth` are public by design (mounted before `authenticateJWT` at `router/v1.ts:33`); `platform-config` is gated at the mount (`v1.ts:46`); `admin-request POST /` is open by design.

**Method worth repeating:** check `audit_logs` and frontend callers BEFORE gating, not after. Gating `PUT /outlet-workspace` blind broke a real agency flow (22 legitimate calls) and needed `4c7151c` to revert — see [[outlet-agency-gaps]].

**Caveat on everything above:** none of it has been exercised against a running server; the repo has zero tests.
