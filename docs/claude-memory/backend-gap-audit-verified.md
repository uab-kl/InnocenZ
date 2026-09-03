---
name: backend-gap-audit-verified
description: Repo-verified backend + linking gap list (2026-07-27) checked against the 6-tab InnocenZ_BuildSteps workbook — what really exists vs what the workbook claims
metadata: 
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-07-29T08:24:22.211Z
---

Audited `apps/backend/src` against the workbook on **2026-07-27** (branch SL, HEAD e9d082b). The workbook has grown to 6 tabs: Outlet · Agency · PR · Admin one-page specs + Overall(Parts 1–10) + Build Steps(§1–4). See [[buildsteps-workbook-house-style]].

**Truly absent from backend (grep = 0 hits):** `receipt_no` / `source` columns anywhere (so OCR-vs-self-log split, receipt-number stamping, duplicate-409 and "agency verifies by receipt no" have NO DB backing — the workbook writes as if this exists); `POST /payment-voucher/mine/:id/sign`; `GET /shift-assignment/live`; outlet `/geocode`; any scheduler (no node-cron/BullMQ dep); any notification table/notify(); any OTP/twilio/phone_verification; any Σ=0 golden-audit; outlet-transaction settle/remind/pay.

**Exists but the workbook says it doesn't:** `agency_user.sub_role` + `outlet_user.sub_role` ARE real PG enum columns with repo filters — only *enforcement* is missing (no middleware reads them; `require-role.ts` is role-level). Leave/MC lifecycle is DONE (`/mine/:id/leave`, `/:id/leave/approve|reject`, migration 0049) and wired web+mobile; only the auto-offer/notify half is missing. `listReplacementCandidates` + `/backfill` exist but order by tier parity only — extend, don't build fresh.

**Real bugs confirmed:** `DELETE /payment-voucher/:id` sits under `requireRole('admin','agency')` → agency CAN delete a PV (routes.ts:30). `pr_signed_at` is only writable via the agency-only `PUT /:id` → today the agency signs for the PR. `getByUserId` = `WHERE user_id LIMIT 1`, no agency scope (pr.repository.ts:50) — see [[roster-live-tab-and-pr-mobile-scoping]]. check-in/out accept NO body → no lat/lng, no Haversine, and `shift_assignment` has no location columns (outlet.lat/lng/geo_fence_radius DO exist).

**Dead endpoints (0 frontend callers):** `PATCH /outlet/:id/geo-fence`, all of `commission-config`. Mobile: 20 files import `demo-shifts`/`demo-payment-history`/`demo-services` as load-bearing *libraries* (shift-session, payment-history-map, signed-pv) — unwiring is a refactor, not a delete. No sign-up screen exists at all (LoginScreen only).

Migrations now at **0049** (0048 = pv_line proof_photos, 0049 = leave status), newer than [[workspace-tier-rate-daily-wage]] recorded.

**STALE-BY 2026-07-29 (HEAD bded663) — closed since this audit:** scheduler + `notification`/`notify()` now EXIST (`72fc61f`); dispute repository/controller/routes + agency queue built; agency-DELETE-PV hole closed (`canDelete` guard); check-in/out now accepts `{lat,lng,accuracy}` with Haversine enforcement in `shift-assignment/check-in-geofence.ts`. Migrations at **0064**. Still true from this audit: no PR sign endpoint, no `GET /shift-assignment/live`, no Σ=0 audit, no OTP/twilio, no settle/remind/pay, `getByUserId` LIMIT-1. Current per-phase state lives in [[role-split-and-build-order]].

**Also corrected 2026-07-29:** outlet `/geocode` EXISTS and works (returns candidates with a `precision` field), and `PATCH /outlet/:id/geo-fence` is no longer a dead endpoint — the outlet Settings → Attendance card calls both. Whole chain now proven live end-to-end, see [[geofence-live-verified]].
