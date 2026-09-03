---
name: pv-money-classification
description: "PV line component writer + backfill, and the overtime bug it exposed (28 Jul 2026) — how lines get classified, and why OT now returns 0 past 16h"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2767147f-8f41-4a7e-88f8-868be9d52d72
  modified: 2026-07-28T06:50:44.398Z
---

Shipped 28 Jul 2026 on branch SL. Closes Phase E's first item — which needed **no migration**, contrary to the old plan (see [[workbook-reverification]]).

**How a line gets its component.** `payment_voucher_line.component` (PG enum `payment_voucher_component`: `wages | drink_commission | tip_commission | ot | deduction | other`) was live since 0051 with nothing writing it. The classification was already in the data: a PR-logged line packs its `kind` as the first `|`-separated field of `ref` (`encodeRef` in the controller). So `payment-voucher-component.ts` **derives** it, and returns undefined when the ref carries nothing — NULL stays honest and distinguishable from a real `other`.

**Applied in the REPOSITORY (`withComponent`), not per call site** — all four insert paths (weekly generator, agency create/update, PR self-log, receipt import) get one rule. This matters for the lane split: it classifies jk's `addMyLine` path without either side editing the other's controller code. A caller-set component is never overwritten; the generator sets `'wages'` explicitly because its ref is a bare assignment id.

**Backfill done (`89962f5`, `d2ecb1e`).** All 21 live lines classified, 0 NULL: 11 drink_commission · 4 tip_commission · 3 wages · 1 ot · 2 other. Script kept in the session scratchpad; it is idempotent and preview-by-default.

**OT is detected from the dedupe marker, not the kind.** Overtime is logged with the coarse `kind='others'`, so kind alone bucketed a whole night's OT as `other`. The phone marks it: `dedupeRef: ${assignmentId}-ot` (apps/mobile CheckInScreen). Checked FIRST as the more specific fact.

**The bug that surfaced — fixed in `93db9ae`, but the bad row is still on the voucher.** Check-out computed `otHours = elapsed_wall_clock - 6` with **no upper bound**, so a forgotten check-out inflates it without limit. One live voucher bills **"Overtime 113.1h @ RM6.00/h" = RM678.78** against RM1084 of real wages — a third of the voucher, for a week with only 168 hours in it. `overtimeHours()` in `apps/mobile/src/lib/pr-rate.ts` now returns **0 past 16h** rather than a capped figure: a capped number is still invented money and looks deliberate once issued. Out-of-order and unparseable stamps return 0 too. **The RM678.78 row was NOT corrected** — deliberately left for the user to decide, since it is an existing money record.

**DB-verified 28 Jul 2026 (second pass) — the bad row is NOT an issued money record.** Voucher `34364790-fc1f-4ef3-830e-99773198bda8` (Velvet 23, week 2026-07-27→08-02) is `status='pending_review'` with `issued_date`, `finance_head_signed_at`, `pr_signed_at`, `paid_at` and `bank_ref` **all NULL** — an unsigned draft for the week still in progress, not something anyone has been paid. Correcting it is editing a draft, not restating an issued voucher, which is the opposite of the caution recorded above. Subtotal 1581.48 = wages 700 + 3.60 + 3.60 + 17.00 + **678.78 OT** + 170.00 + 8.50; dropping the OT line means recomputing `subtotal`/`net` to **902.70**. (The earlier "RM1084 of real wages" was the wages total across BOTH vouchers — on this one wages are 700.)

**Receipt coverage: "3 of 15" is a migration artifact, not a data habit.** The split is purely by time, on the `receipt_id` column added in migration `0053`. Every commission line created on/before 2026-07-23 (12 lines, voucher `961ca742`) has `receipt_id IS NULL`; every one created 2026-07-27 or later (3 lines) has a receipt — **0% before the feature, 100% after**. No PR is skipping receipts. The only later unbacked lines are `wages` and `ot`, neither of which is receipt-backed by design.

**Where the RM6.00/h actually came from — a second, separate unit bug (traced 28 Jul 2026, NOT yet fixed).** The DB column `standard_shift_hours` is aliased in Drizzle to the TS field **`otAfterHours`** (`outlet-workspace.model.ts:91`, `shift.model.ts:76`); `shift-assignment.controller.ts:62` passes it through as `rate.otAfterHours`, and `overtimePay()` in `apps/mobile/src/lib/pr-rate.ts` spends it as **ringgit per hour**. So a 6-hour shift-length threshold was billed as a RM6.00/h pay rate: `113.1 unbounded hours × RM6.00 threshold-as-rate = RM678.78`. Two independent unit confusions compounded — `93db9ae` bound the hours, the rate side is untouched. The rename spans both lanes, so agree it with jk.

Related and live: `basePayFromPayTierRows()` feeds `shift.pay_per_hour` from tier rows that hold **daily** wages since 0047, so all 7 shifts read 500.00. It renders as "RM500.00/hr" on the agency roster (`RosterBackendTimetable.tsx:451`) and is the OT fallback multiplicand (`pr-rate.ts:184`, `payPerHour × 1.5` → RM750/h) for any outlet with no configured rate. By contrast `outlet_workspace.base_pay_per_hour` (83.33 on four outlets, 500 on two) is **inert** — only the workspace controller and its zod schema read it, nothing computes from it.

**Receipt guard shipped `c42b222`:** `prepareLine()` = classify + assert, replacing `withComponent()` at all four insert paths. Throws on a commission line with no `receiptId`; `wages`/`ot` pass. Cannot fire on current data. Gap left open: `PaymentVoucherLineSchema` has no `receiptId`, so a `PUT` sending `lines` would strip the FK — nothing sends `lines` today.

The 6-hour threshold stays hardcoded: `standard_shift_hours` exists on `outlet_tier_rate` but is **not** in the `/shift-assignment/mine` payload. Widen the payload rather than change the constant.

`apps/mobile` is jk's lane — the OT fix needs flagging to him before merge.
