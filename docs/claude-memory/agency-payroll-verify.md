---
name: agency-payroll-verify
description: "Agency payroll verify surface shipped 28 Jul 2026 (0ba5309) — receipts on the voucher detail, and the finding that only 3 of 15 commission lines have any evidence"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2767147f-8f41-4a7e-88f8-868be9d52d72
  modified: 2026-07-28T04:40:29.580Z
---

Shipped 28 Jul 2026, branch SL, commit `0ba5309`. **This item was recorded in [[outlet-agency-gaps]] as hard-blocked on a missing `receipt_no` column — that was stale.** `payment_voucher_receipt` already has `receipt_no`, `order_no`, `source`, `receipt_date/time`, `proof_photos`, `shift_assignment_id`, with 4 live rows (3 `scan`, 1 `manual`). Nothing was blocking it.

**What changed.** `GET /payment-voucher/:id` now returns `receipts[]` next to `lines[]`. Two deliberate choices worth keeping:
- Loaded in the **controller**, not `repository.getById` — the PR `/mine/*` paths poll that method and never need receipts.
- Loaded **after** the agency-ownership 404 check, so a foreign voucher cannot leak its evidence.

**The panel** (`agency-portal/components/agency/PayrollVerifyPanel.tsx`, mounted at the bottom of the voucher detail in `routes/agency/pv.tsx`) groups the week by component, lists each receipt with source + proof count + the lines it backs, and flags **commission lines with no receipt behind them**. It is **read-only on purpose**: there is no verify/approve endpoint, and a button that only moved local state would repeat exactly what the dispute "resolve" button already does.

**The finding, and it is a real one:** only **3 of 15** commission lines are receipt-backed (2 of 11 drinks, 1 of 4 tips). One of the two vouchers has 14 lines and **zero** receipts — entirely self-declared. This is not a bug in the flag: `addMyLine` writes a bare line with no receipt, while `createReceiptWithLines` writes a receipt and FK-links its lines. Whether that gap is a data-entry habit or a missing enforcement rule is a **product call still open**.

**Not verified live** — the agency portal needs a real session and the assistant does not enter passwords. Typecheck clean both apps; Vite transforms all three modules. Sign in as an agency owner, open Victoria Tan Mei Lin's voucher, and the unbacked-commission callout should fire.

Guard worth remembering: demo vouchers use ids like `pv1`, so the evidence query is gated to real uuids (`UUID_RE` in `use-agency-pvs.ts`) or it fires a failed request on every open.
