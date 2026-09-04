---
name: innocenz-status-colour-code
description: "Owner's platform-wide colour code for money/review status — green settled, amber waiting (pending AND approved), white mixed, red disputed/deducted; applies to PR app, agency receipts, and PVs"
metadata: 
  node_type: memory
  type: project
  originSessionId: c58b9c76-54bb-47e1-924e-395263a256a1
  modified: 2026-08-22T19:46:06.352Z
---

Owner's standing colour code (23 Aug 2026), platform-wide — PR app grids/sheets, agency
receipt surfaces, and PV status pills:

- **Green** = settled: verified receipts, sealed wages, totals, signed/paid vouchers.
- **Amber** = waiting: `pending` AND `approved` share the same warning colour — the
  owner's explicit call, twice: *"approved yellow warning colour same with Pending"*.
  The word carries the difference, the colour carries the urgency.
- **White** (default ink) = mixed: a cell/day holding two or more distinct states
  ("approved and pending", "verified and pending", "approved and verified").
- **Red** = needs attention: disputed, or money taken off (deductions — including the
  deductions row's TOTAL).

**Why:** the owner runs both surfaces side by side on real devices and reads colour
before words; a state that renders green on the phone and grey/ink on the web reads as
a disagreement about the money.

**How to apply:** any new status chip/pill/cell touching receipts or PVs uses this map.
Mobile: `cellReviewTone()` in [[innocenz-system-map]] `apps/mobile/src/lib/receipt-review.ts`
is the per-cell authority (verified/warning/mixed/null), dispute red outranks. Web:
`STATUS_VARIANT` in `AgencyReceiptsPanel.tsx`. Wages and TOTAL columns are always green
when non-zero (sealed facts/arithmetic, no review state to borrow).

**Live duty states (owner, 23 Aug 2026):** ON DUTY = a check-in stamp and no
check-out, NOTHING else — "if pr check in only on duty, if not yet check in is
schedule". Booked-not-checked-in = SCHEDULED, and the travel/cooldown minutes
around a booking count as scheduled too ("if still in cooldown time or travel
time need show that the pr is scheduled"). Authority: derivePrLiveStatus() +
TRAVEL_BUFFER_MINUTES in apps/web/src/agency-portal/lib/pr-live-status.ts; the
server travel-gap guard remains the assign-time authority.
