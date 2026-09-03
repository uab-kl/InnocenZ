---
name: db-audit-live-verified
description: "Live-DB audit 28 Jul 2026 — 36 code tables all exist, 3 orphan tables live with no code, payment_voucher_dispute is 100% unwired, and 3 workbook claims are now wrong"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2767147f-8f41-4a7e-88f8-868be9d52d72
  modified: 2026-07-28T00:37:56.127Z
---

Audited the live `innocenz-test` DB (103.224.93.109:6543, creds in **repo-root `.env`, not apps/backend/.env**) on 2026-07-28 by read-only `information_schema` + `pg_enum` + `pg_indexes` queries. Python is absent — use Node with `NODE_PATH=<repo>/node_modules` so `pg`/`jszip`/`exceljs` resolve from a scratchpad script.

**Counts:** 36 tables declared in code (a 37th, `test`, is commented out in `db/db.model.ts`); **all 36 exist live**; the DB has **39**. The 3 extras — `admin_mfa`, `dispute`, `platform_standards` — have **zero references anywhere in this repo** (another branch/app shares the DB). `dispute` is NOT `payment_voucher_dispute`; two rival dispute designs now coexist.

**The one dead table:** `payment_voucher_dispute` exists with its per-day-per-component UNIQUE rule already in place, but is the only table with **0 files outside its own `*.model.ts`** — the live `/mine/:voucherId/dispute` route still writes the 3 flat `payment_voucher.dispute_*` columns. Cheapest big win: repoint the route. Related: `payment_voucher_line.component` enum is live but **NULL on all 19 rows**, which blocks per-component disputes underneath it. Supersedes the "never FK a dispute to a voucher line" design note in [[pv-dispute-design]] — the table is built, just unused.

**Three claims in `InnocenZ_BuildSteps.xlsx` are now false** (they were true when written 23–27 Jul): `pr_tier` has all 7 values live so no `pnpm migrate` is pending for spine E; `shift_assignment` has all **8** check-in/out geo columns AND `check-in-geofence.ts` does the server-side Haversine with no demo bypass (only the phone isn't sending coords — 0 of 6 rows have any); `outlet_drink_menu.category` is live. Also: receipt uniqueness is on **`receipt_no` alone, globally** — there is no `outlet_id` column on `payment_voucher_receipt`, contradicting the PR tab. And sub-roles DO exist as populated `agency_user.sub_role` / `outlet_user.sub_role` enum columns — **no guard anywhere reads them**, so it's a guard job not a migration (corrects [[backend-gap-audit-verified]]).

**Genuinely missing:** only `notification` and `phone_verification` (mobile already calls `/auth/otp/send|verify`, which 401 because no route exists — see [[otp-channel-split]], [[pr-signup-mobile]]), plus **no scheduler at all**: `payment-voucher-generator.ts` is real code but manual-only, not even aliased in package.json.

**Data-state gotchas:** only **1 of 6 outlets has a geo pin**, so 5 venues are unfenced (enforcement is per-outlet, switching on when a pin is saved); `outlet_drink_menu` has **0 rows of category=tip**; 5 of 35 `outlet_tier_rate` rows have NULL `daily_wage`; `commission_config` + `outlet_transaction` have routes but **zero frontend callers** in web or mobile; there is **no mailer package at all** so `forgotPassword` only `logger.info`s the reset URL. `pr.repository.getByUserId` is still `LIMIT 1` with no agency scope.

Do NOT diff migrations by hashing the `.sql` files against `drizzle.__drizzle_migrations` — files were edited after being applied, so it reports ~25 false "not applied". Verify schema state by querying columns/enums directly.
