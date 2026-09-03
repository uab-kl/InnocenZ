---
name: workspace-tier-rate-daily-wage
description: outlet_tier_rate now stores DAILY wage in a renamed daily_wage col; migration 0047 APPLIED (rename+backfill+outlet_id); daily-wage bug fixed
metadata: 
  node_type: memory
  type: project
  originSessionId: d7c27bdc-1edb-44f4-bcd9-ca4aa5735901
  modified: 2026-07-23T01:03:12.809Z
---

Investigated + FIXED 2026-07-23 (branch SL). The outlet Workspace rate card daily-wage bug and the outlet_id gap.

**No duplication ever existed.** Each of the 5 demo outlets has exactly 1 `outlet_workspace`, 7 `outlet_tier_rate`, 7 `outlet_drink_menu`. Apparent "duplication" = same demo drink NAMES across outlets, each scoped by its own workspace_id. See [[drinks-services-split]].

**The bug (now fixed).** `outlet_tier_rate.wage_per_hour` was meant to hold the DAILY wage (Tier I = 500) and `ot_after_hours` the standard shift hours (6), but the seed stored hourly-equivalents (83.33 / OT-per-hr 125). The live PR pay calc (`shift-assignment.controller.ts resolveTierWages` → repository selects the tier rate) reads the raw column, so pay was computed off 83.33.

**DONE — migration 0047 (`0047_tier_rate_daily_wage_and_outlet_id.sql`) APPLIED to shared innocenz-test:**
- Renamed `outlet_tier_rate.wage_per_hour`→`daily_wage`, `ot_after_hours`→`standard_shift_hours` (and the same on `shift_pay_tier`, which was empty).
- Backfilled stale rows: `WHERE kind='tier' AND standard_shift_hours>24 SET daily_wage=ROUND(daily_wage*6), standard_shift_hours=6`. Result verified: daily wages now 500/600/700/825/1000/200, hours=6 for all 5 outlets.
- Added direct `outlet_id` FK (NOT NULL, cascade, backfilled from workspace) to BOTH `outlet_tier_rate` and `outlet_drink_menu`. Verified 0 nulls, 0 parent mismatches.

**Code approach (APPLIED, backend tsc GREEN):** kept the TS property names `wagePerHour`/`otAfterHours` and just remapped the drizzle column strings — `numeric('daily_wage')` / `numeric('standard_shift_hours')` in `outlet-workspace.model.ts` (OutletTierRateTable) and `shift.model.ts` (ShiftPayTierTable). This keeps the API/wire shape the MOBILE app consumes unchanged. Added `outletId` FK column to both child tables in the model; repo `upsertByOutletId` now sets `outletId` on child inserts and `WorkspaceChildren` omits it. The frontend read-time repair `repairTierRatesDailyWageSemantics` (agency-demo.ts) is now INERT on correct data (base 500 ≠ 83.33 → not triggered; hours=6 not >24). NOT renamed downstream (controller/schema/frontend/mobile) on purpose.

**Also fixed in the same pass (were pre-existing red builds on branch SL, NOT from this work):**
- Registered orphaned migration `0046_user_profile_comcard_image` in the journal (idx 46, when …030) — the file existed but a duplicate-`tag` key on journal idx 45 orphaned it, so `user_profile.comcard_image` was missing while pr.repository.ts selects it. Now applied. Fixed the duplicate-tag corruption too.
- Restored missing `const prDisplayNameSql` in `shift-assignment.repository.ts` (a merge dropped the def, kept 2 usages).
- Widened `PrProfile.portfolioPhotos` to `(string|null)[]|null` in `pr.model.ts` to match the jsonb column (was `string[]`).

**Migration mechanics learned:** `__drizzle_migrations` was BEHIND (last recorded when=…027 / 0043) while schema was ahead — drizzle re-applies everything with when > last recorded, so 0044/0045 (idempotent) re-ran harmlessly and tracking is now current at when=…031. See [[backend-migrations-shared-db]].

**Still uncommitted on branch SL** (all of the above + the earlier agency-create-shift removal — see [[outlet-post-job-next]]). Not yet committed. Web `tsc --noEmit` has 128 PRE-EXISTING errors (route-gen + unused imports) — not the project's gate; my changes add none.
