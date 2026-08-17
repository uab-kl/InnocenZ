---
name: innocenz-rbac-portal-cru
description: RBAC model — 3 portals, 7 seeded roles named Owner/Finance/Ops Head (not agency_owner), module_key × C/R/U only, and the two traps that make the matrix lie
metadata:
  type: project
---

# RBAC redesign — Portal → Role → Module C/R/U

Synced 6 Aug 2026. **Role names corrected 17 Aug 2026** — see the warning below.

## Model

- **3 master portals** in `main.portal`: `admin`, `agency`, `outlet` (PR/mobile is **not** a portal row; role `pr` keeps `portal_id` null).
- **Role** → one `portal_id`. ⚠️ **The seeded role NAMES are `Owner`, `Finance` and `Ops Head`** — repeated per portal and told apart by `portal_id`, NOT compound names. `SEEDED_PORTAL_ROLES` in `apps/backend/src/types/rbac-constant.ts` seeds exactly **seven**:
  `admin` (admin) · `Owner` + `Finance` (agency) · `Owner` + `Finance` + `Ops Head` (outlet) · `pr` (portal null).
  **Agency has no Ops Head.** Bare `agency` / `outlet` are marked `@deprecated Not seeded`.
  (Until 17 Aug this file said `agency_owner` / `outlet_ops`; that was wrong and had been copied into the MVP workbook.)
- **Module** → `portal_id` + stable `module_key` (unique per portal). 19 module keys as of 17 Aug 2026.
- **Permission types**: `create` | `read` | `update` only (delete removed by 0103).
- **Org membership** (`agency_user` / `outlet_user`) is **tenancy only**. `sub_role` was DROPPED by migration 0107 — ACL comes from `user_role` → `role` plus the module matrix.

## Enforcement

- Portal entry: web `ensurePortal` + backend `requirePortal` / `requireRole`.
- Writes: `requirePermission(moduleKey, type)` (e.g. `payment_voucher` update for PV; `booking` create for outlet ops).
- Lane checks: `middlewares/require-sub-role.ts`, which reads `portalCode` off the role — the pattern to copy.
- Org ownership still needs membership as well: see [[innocenz-org-scope-guards]]. A role guard that never asks *whose* row it is, is not a scope check.

## Two traps that make the matrix lie

1. **Removing a grant from the seed does not revoke it.** `applyRoleGrants` inserts with `onConflictDoNothing` and never deletes, so a stale row survives every re-run — and these seeded grants BEAT the portal's own `agencyCan()` / `outletCan()` matrix. Revoking for real means deleting the database row.
2. **A guard naming a deprecated role is dead code.** `middlewares/redact-identity-docs.ts:40` gates on `roleNames.includes('outlet')`, which no real user holds, so PR identity documents are never redacted for venue logins (found 17 Aug 2026, contradicting that file's own 30 Jul owner decision). When a guard "does nothing", check the role name against `SEEDED_PORTAL_ROLES` first.

## Ops

1. Fix `DATABASE_URL` so the target DB exists.
2. `pnpm migrate:deploy` from the repo ROOT (runs init-roles → seed-rbac → migrate-sub-roles → init-admin).
3. Restart backend (tsx watch serves stale routes).
4. Live-verify §4d RBAC checklist + §9 "RBAC redesign live verify".
