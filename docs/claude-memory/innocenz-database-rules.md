---
name: innocenz-database-rules
description: "Standing InnocenZ database rules — analyse the related tables and full flow FIRST, reuse tables, audit quartet, FK-only references, id-first PKs, UI writes must persist and be called by primary id"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4aa4a5ea-6778-4671-add3-d3da9d125db4
  modified: 2026-09-12T00:00:00.000Z
---

**Before touching the database, ALWAYS analyse the related tables and know the full data flow through them** (who writes, who reads, which portal shows it) — never change a table in isolation.

Standing rules the user restates on nearly every DB-touching request (verbatim spirit):

1. **If there is an existing table, use it — don't create a new one.** New columns/tables only when truly needed; think logically where they belong. Never a new column when an existing one serves.
2. **Audit columns travel together:** if a table has any of `created_at`, `updated_at`, `created_by`, `updated_by`, it must have all four. **`created_by` / `updated_by` store the acting user's `user.id` (uuid), never phone/email/username.** Unauthenticated writes (public register, OTP, jobs) use the literal `'system'`.
3. **Use foreign keys to call data from other tables — never copy fields like `name`** (stale `pr.name` copies caused real bugs; reads must join through FKs).
4. **Every table leads with its `id` primary key**, and anything the web UI creates must be stored in the DB and later referenced by that primary id.
5. No duplicated/same data anywhere; success UI may only show after the row is truly committed (server-confirmed).
6. Migrations: never reuse an existing migration number — modify existing files in place when repairing; add new numbers only when really needed.

**Why:** the user checks tables directly in pgAdmin 4 and treats it as ground truth; copies and unlinked data read as bugs to them. The DB (`innocenz-test`) is also shared with a teammate building the Outlet/Agency portals — duplicated or denormalised data desyncs the portals, and FK joins keep one source of truth.

**PR identity (0089):** `main.pr` is gone. A PR **is** a `user` account; membership/tier live on `agency_pr`. Ops columns named `pr_id` are legacy and equal `user_id` after remap — prefer `user_id` in new code.

⚠️ **`rating.pr_id` is a DELIBERATE exception, not a weak edge to repair** (re-verified 12 Sep 2026 against `rating.model.ts:6-9`). It is a plain `varchar` with no FK on purpose: *"an outlet's PR list is not backend-enumerable from the outlet token (the /pr + /shift routes are agency/admin-only), so the id may be a real PR uuid or the frontend's PR identifier."* ⚠️ **`CLAUDE.md` currently mis-describes this** as "ONE weak edge is left: `rating.pr_id` is varchar (needs uuid + FK)" — converting it to a uuid FK would break outlet ratings for exactly the reason the model comment gives. Confirm with the team before ever migrating it.

**How to apply:** before any schema/write change, map the affected flow end-to-end (e.g. shift → shift_assignment → payment_voucher → payment_voucher_line), restate which existing table is reused, which FKs resolve names, and confirm audit columns. Afterwards verify in the live DB and run `pnpm --filter innocenz-backend check:drift`. ⚠️ Run migrations with `pnpm migrate:deploy` from the repo ROOT, then **prove the DDL actually ran** — drizzle reads `postgres/migrations/meta/_journal.json`, not the folder, so a hand-written `.sql` that is not registered there is silently skipped while the command still prints "migrations applied successfully" (hit again 12 Sep 2026). Related: [[pr-mobile-backend-wiring]], [[innocenz-system-map]], [[mc-leave-flow]].
