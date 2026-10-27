---
name: ot-not-auto-paid
description: Overtime is no longer auto-sealed onto a voucher at check-out — it renders as pending agency approval. The agency approve flow NOW EXISTS (PATCH /shift-assignment/:id/overtime, owner + finance; re-checked 21 Oct 2026).
metadata: 
  node_type: memory
  type: project
  originSessionId: 989c3550-d0c3-4dc7-81a9-b6eec4955c1f
  modified: 2026-10-21T08:38:53.014Z
---

Settled on the SL↔main merge (`2df9282`, 28 Jul 2026). jk's `7aebd4a` won the design argument and
this branch's math survived underneath it.

## The rule
A PR's phone **must not write overtime money onto a payment voucher.** At check-out `CheckInScreen`
now seals only the `wages` line. Overtime renders as an amber note — *"Overtime 2.0h (RM250.00) —
pending agency approval · not added to payout"* — and is **not** money until someone approves it.

Three guards stack, and all three matter:
1. **Server clamps** a forgotten check-out to the shift's scheduled end (`checkOutMine`), so pay
   locks to the shift window. No clamp when the free-text slot has no parseable window.
2. **`overtimeHours()`** (mobile `lib/pr-rate.ts`) returns 0 past `MAX_PLAUSIBLE_SHIFT_HOURS` (16)
   or for out-of-order stamps — the display path goes through it rather than subtracting 6 inline,
   so a clamp that never ran still cannot surface the old "113.1h".
3. **`overtimeRate()`** derives `daily_wage / 6 × 1.5` (Tier I → RM125/h). Never quote
   `rate.otAfterHours` as ringgit — despite the name it is `standard_shift_hours`, and it is 6.

## The approve flow — BUILT since (re-checked 21 Oct 2026)
This section used to say the agency approve/pay flow did not exist ("no endpoint, no UI, no record").
That is no longer true: `shift-assignment.routes.ts` has `GET /overtime/pending` (line 54) and
`PATCH /:id/overtime` → `decideOvertime` (line 72), gated `agencyOwnerOrFinance` because deciding
overtime raises money onto a payment voucher. Still true: OT is never money until the agency decides
it — so marketing must never say overtime is paid automatically. See [[pv-money-classification]]
for how the resulting line's `component` is classified.
