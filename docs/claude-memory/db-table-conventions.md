---
name: db-table-conventions
description: "Schema rules for InnocenZ - never duplicate an existing table, reuse other tables via FK, and every table carries the 4 audit columns"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7aa31d4a-b6c3-4755-b2a0-91065e285b50
  modified: 2026-07-20T09:07:26.450Z
---

Three rules for any schema work in InnocenZ (stated by the user 2026-07-20):

1. **Check before creating.** If a table for the concept already exists in the DB, extend it — never create a second one alongside it.
2. **Reuse via foreign key.** If the data already lives in another table, reference it with an FK instead of copying the columns.
3. **Audit columns on every table** — new *and* existing. All four, non-null:

```ts
createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
createdBy: varchar('created_by').notNull(),
updatedBy: varchar('updated_by').notNull(),
```

**Dropped 2026-07-20:** `limit_type`, `subscription_feature`, `subscription_role` (migration 0028, applied to shared DB; 37 → 34 tables). Plan→role linkage was gone for a while and audience was *derived* from `billing_cycle` — **that is no longer true**: migration 0036 added `subscription.subscription_type` + `role_id`, and every one of those call sites now reads the column. Note: migrations 0020+ are **hand-written** (snapshots in `meta/` stop at 0019), and `drizzle-kit generate` therefore prompts for rename-vs-drop and cannot run non-interactively here — write the SQL and the `_journal.json` entry by hand, continuing the synthetic ascending `when` values (0028 used 1784500000012).

**Rule 3 backfill DONE 2026-07-20** (migration 0029, applied + verified). All 34 tables now carry the four columns except the deliberate exclusions below. On the backfilled tables `created_by`/`updated_by` are `varchar NOT NULL DEFAULT 'system'` — the default is required because their repositories (outlet-workspace children, voucher lines, reset tokens, audit middleware) don't pass an actor; older tables keep bare NOT NULL. Fixed drift on the way: `platform_config.created_by` was declared in the model but absent from the DB, so inserts through that repository would have failed.

**Never touch `admin_mfa`, `dispute`, `platform_standards`** — they live in the shared DB with **no Drizzle model and no migration in this repo** (likely a teammate's unmerged branch). User confirmed 2026-07-20: leave them alone, including not dropping `platform_standards`.

**Rule 2 in progress (2026-07-20).** User chose "apply everywhere, no exceptions", except cases that are structurally impossible and stay as-is:

- `member_subscription`/`admin_request.subscriber_name` — subscriber_id is polymorphic across agency|outlet, no FK possible.
- `pr.name`/`ic_no`/`phone`/`email` — `pr.user_id` is nullable with onDelete set-null, so a PR can have no account.
- ~~`special_service.assigned_agency_name`~~ — **RESOLVED 2026-07-20, exception withdrawn.** It was never dual-purpose: `assigned_agency_id` is NULL on all 10 rows and always was, so the column only ever held external vendors. Migration 0035 simply renamed it to `vendor_name` and dropped the dead FK. No data moved, nothing lost.
- **`rating.pr_name` (NEW exception — prerequisite unmeetable).** It could only go once `rating.pr_id` became a real uuid FK, and that cannot happen: `store.ts` (~line 6604) states the rate UI is demo-driven and passes demo PR ids plus `prName` precisely *because* `prId` is not a real PR. A uuid FK would reject every insert. Revisit only if the ratings UI is wired to real PR data.

Remaining to drop (user approved 2026-07-20 "with joins added to preserve every API response field"): `payment_voucher.pr_name`/`pr_ic` + `outlet`→outlet_id FK, `payment_voucher_line.outlet`→FK, `outlet_transaction.outlet_name`, `special_service.posting_agency_name`, `member_subscription.plan_name`. (`special_service.outlet_name` is DONE — dropped in 0035 with the outlet join added.)

**Rule 2 means reuse via FK, not delete the data** — every read path returning these names needs a join so API responses keep the field. Probe before migrating: `payment_voucher`, `payment_voucher_line`, `rating`, `outlet_transaction` are all EMPTY (0 rows), so those conversions are free; `member_subscription` (14 rows) and `special_service` (10 rows) have every FK populated and zero name drift.

**Rule 1 still open:** `outlet_workspace` holds default rates (`base_pay_per_hour`, `drink_pct`, `tip_pct`, `table_pct`, `ot_after_hours`, `happy_hour_drink_discount_pct`) and its child `outlet_tier_rate` holds the same six concepts per tier, with nothing in the schema saying which wins. Both are empty, so collapsing them is free — needs a product call on precedence. Resolved as no-ops instead: `platform_config` vs `platform_standards` (keep both, orphan untouchable) and `dispute` vs `payment_voucher.dispute_*` (user deferred).

**State at 2026-07-20 handoff — branch `SL`, ALL COMMITTED, migrations 0028–0036 ALL APPLIED.** Latest three: `e965969` (0034 outlet), `9de295e` (0035 special_service), `914b7e8` (0036 subscription). Nothing is left unapplied and the screenshot spec is fully delivered — see [[schema-reshape-backlog]] for the per-migration detail and what remains. Two known-good non-issues: `pr.repository.ts` has 2 pre-existing `portfolioPhotos` nullability errors (not from this work, don't chase), and `apps/web` has many pre-existing `agency-portal` type errors — filter tsc output to the files you touch. The rewritten admin Plan page is typechecked but was **never clicked through in a browser** (port 4000 was held by another chat's dev server).

**Why:** the DB is shared (see [[backend-migrations-shared-db]]) so duplicate tables and copied columns silently drift apart; the audit columns are needed uniformly for traceability.

**How to apply:** before writing a migration, grep `apps/backend/src/features/*/*.model.ts` for the concept and inspect the live DB. Copy the audit block verbatim from `commission-config.model.ts` — camelCase TS property, snake_case column. `createdBy`/`updatedBy` are `varchar` actor strings supplied by the controller via `getActor(req)`, not FKs. Repositories exclude `id | createdAt | updatedAt` from insert types and set `updatedAt: new Date()` explicitly on update. Migration mechanics in [[backend-migrations-shared-db]].
