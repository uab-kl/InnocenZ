---
name: backend-migrations-shared-db
description: "How to safely apply drizzle migrations to the shared innocenz-test Postgres, incl. the timestamp-ordering trap"
metadata: 
  node_type: memory
  type: project
  originSessionId: 99e51269-5dac-4554-b863-5d6151c58dd4
---

Applying backend drizzle migrations to the SHARED Postgres (`postgres.gremoryyx.com:6543/innocenz-test`, PostgreSQL 17.5, superuser `postgres`). Coworker shares this DB but authorized additive changes (see [[dont-touch-backend]]).

**Connection:** the app (`src/db/index.ts`) connects via discrete `POSTGRES_*` vars; **drizzle-kit** connects via `DATABASE_URL` (in `apps/backend/.env`). Both must be filled — `DATABASE_URL` password is separate from `POSTGRES_PASSWORD`. `.env` is gitignored/untracked.

**Apply with bare** `pnpm exec drizzle-kit migrate --config=drizzle.migrate.config.ts`. NEVER `pnpm migrate` (it runs `drizzle-kit generate` first, then RBAC/admin **seed** scripts that mutate the shared DB). Avoid `drizzle-kit generate` on this shared/drifted tree unless intended.

**TIMESTAMP-ORDERING TRAP (caused a silent no-op):** drizzle-kit decides which journal entries are pending by `entry.when > max(created_at)` in `drizzle.__drizzle_migrations`. The coworker hand-stamped migration `0016_admin_request_requested_plan` with a rounded, FUTURE `when = 1784500000000` (~2026-07-17). Any new migration whose real generated `when` is LOWER is **silently skipped** — drizzle still prints "migrations applied successfully!" with zero changes. Fix: bump the new entry's `when` in `postgres/migrations/meta/_journal.json` above the current `max(created_at)`. Until wall-clock passes ~2026-07-17, freshly generated migrations need a manual `when` bump.

**Pre-check before applying** (read-only): connect via `pg`, verify target objects don't already exist, and read `select max(created_at) from drizzle.__drizzle_migrations` to know the threshold to exceed.

**MERGE RENUMBER (2026-07-19, merge of `main`→`SL`):** `main` had independently used migration numbers 0017–0021 (admin_request status/type enums, user_profile showcase cols, outlet logo). My four migrations collided on 0017–0020, so they were **renumbered to run after main's**: pr `0017→0022`, shift `0018→0023`, payment_voucher `0019→0024`, shift_assignment `0020→0025`. `_journal.json` rebuilt with all 9 entries; **all post-0016 `when` values re-stamped `…001`–`…009`** (above the 0016 trap, strictly increasing, main's before mine). My four `.sql` files were made **idempotent** (`CREATE TABLE IF NOT EXISTS` + `DO $$…duplicate_object` guards on enums/FKs) since the shared DB already has `pr`/`shift` (and possibly others) — re-apply now no-ops safely. Snapshots follow main's loose convention (latest committed = `0019`, main's admin_request state; my post-merge snapshots not committed — same as main omits 0020/0021). NOTE: I bumped main's 0017–0021 `when` off their real values; on a fresh reset all 9 apply in order.

**Done so far (all applied + smoke-tested against the live DB):**
- `pr` feature — migration **`0022`** (was 0017; enums `pr_status`/`pr_tier`, table `main.pr` + FKs agency/user). Bundled `admin_request.requested_plan_id` was stripped (0016 already added it). Later HARDENED: tenant-scoping + `requireRole('admin','agency')` + repo error re-throw + validation caps + pagination clamp.
- `shift` feature — migration **`0023`** (was 0018; `main.shift` + enums `shift_status`/`shift_event_kind`, FKs agency/outlet). Core persisted shape of the frontend `ShiftRequest`; PR-assignment (`prs[]`) join + outlet-role access are follow-ups. Built with scoping baked in.
- `payment_voucher` (`0024`) + `shift_assignment` (`0025`) — my later migrations, now idempotent post-merge.

**Tenant-scoping pattern (reuse for every agency-owned feature):** route `requireRole('admin','agency')`; controller `resolveScope(req)` = admin (roles via `authRepository.getRolesForUserIds`) → unscoped; else agencyId via `agencyMemberRepository.listByUser` (first active membership). Force `agencyId` server-side on create, filter list, and 404 cross-tenant get/update/remove. This `resolveScope` is currently duplicated in `pr.controller.ts` + `shift.controller.ts` — extract to a shared util once a 3rd feature needs it. NOTE: `test-agency@innocenz.dev` has NO `agency_member` row, so it now (correctly) gets 403 on scoped endpoints until a membership is added.

**Next chain:** roster → payment-voucher (PV: prName/outlet/wages/commissions/status draft|sent|signed|disputed/version) → booking. Plus backfill the scoping pattern onto existing agency/outlet features. See [[agency-portal-port]].
