---
name: warn-before-adding-a-migration
description: "STANDING RULE (owner, 8 Sep 2026) — say so and wait before adding any database migration; never slip one into a larger change"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 56e815c6-b57f-4a32-9edf-e106a56c93b6
  modified: 2026-09-08T04:27:21.517Z
---

Before adding ANY database migration to InnocenZ, tell the owner first and let them decide. Never
include one silently inside a larger piece of work.

**Why:** the owner asked for this directly on 8 Sep 2026 — *"warn me before any migration is added from
now on"* — immediately after a session that shipped two hand-written migrations (`0152` per-agency
voucher uniqueness, `0153` renumbering unsent vouchers). Migrations here run against a SHARED
`innocenz-test` Postgres other people are working on; they must be hand-authored because
`drizzle-kit generate` cannot run (see [[migration-journal-corrupt]]); and `drizzle-kit migrate` reports
success while applying NOTHING when a file has no `meta/_journal.json` entry (see
[[backend-migrations-shared-db]]). So an unasked-for migration is not a diff that can be reverted — it is
a change on someone else's database that may or may not have applied.

**How to apply:** when a task looks like it needs a schema change, stop, say what the migration would do
and why, and wait. Check whether one is needed at all first — the 8 Sep PR-history agency split looked
like it needed a new column, and the agency was already on the wire in `vouchers[]` and
`lines[].voucherId`, so it needed no backend change whatsoever. Also state plainly when a change adds NO
migration; that is now information the owner wants. Related: [[innocenz-database-rules]],
[[model-column-without-migration-breaks-login]].
