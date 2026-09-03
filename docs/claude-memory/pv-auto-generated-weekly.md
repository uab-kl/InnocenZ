---
name: pv-auto-generated-weekly
description: "Payment vouchers are auto-generated weekly by the app for PRs — derived, not manually authored"
metadata: 
  node_type: memory
  type: project
  originSessionId: e2a83db1-af45-4ead-bacc-599a705c134a
---

Payment vouchers (PVs) are meant to be **automatically generated weekly by the app** for each PR, not created by hand. So no manual "create voucher" UI is wanted — the admin PV page is intentionally read-only (view generated vouchers).

**Why:** confirmed by the user 2026-07-17. The agency-portal demo already models this: `buildPaymentVoucherFromShift`, `pr-weekly-payment.ts`, `reconciliation-weekly.ts` roll a week's shifts into a PV (subtotal from shift lines, net after deductions).

**How to apply:** the real backend work is a scheduled weekly job that, per agency, groups each PR's shifts for the week and inserts a `main.payment_voucher` (+ lines) — porting the demo's logic server-side. Backend PV feature lives at `/api/v1/payment-voucher` (committed on branch SL). This depends on PRs existing as real `main.pr` rows (currently empty, no UI to populate) so shifts can be grouped by PR — deferred for now, not urgent.

Related: [[backend-migrations-shared-db]], [[dont-touch-backend]].
