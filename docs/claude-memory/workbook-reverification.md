---
name: workbook-reverification
description: "Re-verification of InnocenZ_BuildSteps.xlsx against the live DB + repo on 28 Jul 2026 — which claims drifted, which held, and the DROP-COLUMN landmine it uncovered"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2767147f-8f41-4a7e-88f8-868be9d52d72
  modified: 2026-07-28T03:49:00.890Z
---

Full pass over `Downloads/InnocenZ_BuildSteps.xlsx` (7 tabs: Outlet · Agency · PR · Admin · Overall + Implementation · Build Steps · Database) on **28 Jul 2026**. The **Database tab is self-describing as the newest** and says so in its own header — where it disagrees with the other 6 tabs (written 23–27 Jul), it wins. That instruction is still correct; treat the 6 older tabs as unverified.

**The find worth remembering — a DROP-COLUMN landmine, now fixed (`9ca5213`).** `payment_voucher_line.component` and its PG enum `payment_voucher_component` (`wages | drink_commission | tip_commission | ot | deduction | other`) are LIVE from 0051, but the Drizzle model had only the *doc comment* — the field declaration was gone, leaving the comment orphaned on `proofPhotos`. Drizzle did not know the column existed, so the next `drizzle-kit generate` would have emitted a `DROP COLUMN` on the field that classifies a money line. **This also corrects [[pv-dispute-design]]**, which says 0051 "deliberately does not touch `payment_voucher_line`" — the column is there. Phase E item 1 ("write `component` on PV lines") therefore needs **no migration**, only a writer: all 21 lines are still NULL.

**Counts that DRIFTED since the Database tab was written (same day):**
| Claim | Actual 28 Jul |
|---|---|
| `outlet_drink_menu` 37 rows · 6 drink / 31 service / **0 tip** | **50 rows · 32 drink / 12 service / 6 tip** — the tips bucket is no longer empty and the mislabelling is gone |
| `outlet_workspace` 5 rows, "one outlet has none" | **6** — every outlet has one (Emhub was the gap) |
| `outlet_tier_rate` 35 rows, "5 NULL daily_wage — fill them" | **42 rows; 6 NULL and ALL `commission_only`** — by design, not a gap. The workbook's advice is wrong |
| `payment_voucher_line` 19 | **21** |
| `shift` 6 · `shift_pay_tier` 30 · `shift_assignment` 6 | **7 · 35 · 7** |
| `audit_logs` 1267 | **1366** |

**Held exactly:** outlet 6 · outlets with a pin 1 · `outlet_penalty_rule` 3 · `payment_voucher` 2 (both `pending_review`) · `payment_voucher_dispute` 0 · `payment_voucher_receipt` 4 · `shift_sale` 0 · `rating` 0 · `commission_config` 0 · `outlet_transaction` 0 · `reset_password_token` 0 · `user` 16 · `agency_user` 3 · `outlet_user` 4 · `pr` 10 · `agency_pr` 10 · `platform_config` 1 · `special_service` 13 · `member_subscription` 14 · `admin_request` 12 · 39 live tables · all 3 orphans (`admin_mfa`, `dispute`, `platform_standards`) still present.

**Priority-league entries the workbook lists as open that are now CLOSED by this session** — see [[ungated-router-sweep]]:
- **#3 sub_role guards** ("columns exist, no guard reads them") — built (`fd7af32`, `3749a0d`, `4c7151c`).
- **#6 `DELETE /payment-voucher/:id` hole** — now `requireRole('admin')` at routes.ts:30.
- **§2 outlet geo pin** ("only the outlet-side screen is missing") — screen built (`574c266`).

**Still open and still accurate:** `phone_verification` + the 2 missing OTP routes (P0, mobile already calls them) · no PV sign route · no scheduler (`payment-voucher-generator.ts` exists, nothing runs it) · no mailer · phone sends no check-in coordinates · `getByUserId` LIMIT-1 multi-agency bug.

**Method note:** the workbook is XML-patched with JSZip, styles re-probed each time — see [[buildsteps-workbook-house-style]]. This pass produced the corrections but did **not** edit the file.
