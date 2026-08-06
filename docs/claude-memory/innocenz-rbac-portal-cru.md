# RBAC redesign — Portal → Role → Module C/R/U

Synced 6 Aug 2026.

## Model

- **3 master portals** in `main.portal`: `admin`, `agency`, `outlet` (PR/mobile is **not** a portal row; role `pr` keeps `portal_id` null).
- **Role** → one `portal_id`. Specialized ACL roles: `agency_owner`, `agency_finance`, `outlet_owner`, `outlet_finance`, `outlet_ops` (plus legacy `agency` / `outlet` / `admin`).
- **Module** → `portal_id` + stable `module_key` (unique per portal).
- **Permission types**: `create` | `read` | `update` only (delete removed).
- **Org membership** (`agency_user` / `outlet_user`) still defines *which* org; `sub_role` kept for tenancy/invite labels but ACL prefers `user_role` specialized roles + module matrix.

## Enforcement

- Portal entry: web `ensurePortal` + backend `requirePortal` / expanded `requireRole('agency'|'outlet')`.
- Writes: `requirePermission(moduleKey, type)` (e.g. `payment_voucher` update for PV; `booking` create for outlet ops).
- Scoped org ownership still uses membership + specialized role (`agencyOwnerOfParam`).

## Ops

1. Fix `DATABASE_URL` so the target DB exists.
2. `pnpm migrate:deploy` (runs init-roles → seed-rbac → migrate-sub-roles → init-admin).
3. Restart backend (tsx watch stale routes).
4. Live-verify §4d RBAC checklist + §9 “RBAC redesign live verify”.
