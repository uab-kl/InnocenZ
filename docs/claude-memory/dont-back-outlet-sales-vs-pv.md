---
name: dont-back-outlet-sales-vs-pv
description: "Never wire outlet-sales-vs-PV-total — the whole payment-voucher router is admin/agency only because agency-to-PR payroll is not the venue's business. It is the fix that LOOKS obvious. What 7baf1ec did instead"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8d8947f-3a09-4756-9fc7-2fb0c514a0e5
  modified: 2026-07-30T06:23:48.175Z
---

**Do not try to back the outlet Today reconciliation banner's original comparison.** It compared the
outlet's sales against the **PV total**, and that pair cannot be served on the outlet portal:

`apps/backend/src/features/payment-voucher/payment-voucher.routes.ts` puts
`router.use(requireRole('admin','agency'))` above everything except the PR `/mine/*` block — because
what an agency pays each PR is **its payroll, not the venue's business**. An outlet asking for
`GET /payment-voucher` gets 403, correctly.

**Widening that gate to feed a banner is the wrong trade, and it is the fix that looks obvious.**

## What `7baf1ec` did instead (30 Jul 2026)

Changed the *pair*, not the gate. A backed session now compares the two figures an outlet
legitimately holds:

- **what the agency billed** — `collection_invoice.amount` (see [[collections-two-directions]])
- **the outlet's own record of the shifts behind that week** — `shift_assignment.pay_amount`, via
  `useOutletSalesReport().buildReport({startIso,endIso}).totalCost`

Both derive from the same column, so they should agree, and a gap is the outlet's own question to ask.

**The newest statement defines the period** — the client never derives a week, or it would risk
checking a statement against a different seven days than the agency billed for.

## The legitimate cause of variance, stated in the UI

A statement counts only **`completed`** assignments; the sales-report cost side excludes only
**`cancelled`/`no_show`**. So a shift that ran but was never marked completed reads as a gap. The
banner calls that "worth checking", not a billing error.

## Other decisions in that component

- **No Confirm on the backed path.** Nothing persists an outlet confirmation, so the button could
  only look like it worked — the same failure the rating toast and `cancelMine`'s "your agency has
  been notified" both shipped with. Marking a week settled is the agency's call anyway.
- **Hides when the two match** — an alert that fires every week is one nobody reads by the third.
- Gated on `viewBilling`. **Demo sessions keep the old sales-vs-PV banner verbatim**, so it is a fork
  (two components in one file), not one component fed from two sources.
- Renders only when a statement exists AND the sales report has rows for that same week AND they
  disagree — so on real data the likely outcome is that it correctly shows **nothing**, which is
  indistinguishable from broken until you check.
