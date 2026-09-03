---
name: ot-not-auto-paid
description: Overtime is no longer auto-sealed onto a voucher at check-out — it renders as pending agency approval. The approve/pay flow does not exist yet.
metadata: 
  node_type: memory
  type: project
  originSessionId: 989c3550-d0c3-4dc7-81a9-b6eec4955c1f
  modified: 2026-07-28T08:19:34.084Z
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

## What does not exist
**The agency approve/pay flow.** OT is displayed and then goes nowhere — no endpoint, no UI, no
record. A PR who works overtime currently has no way to be paid for it. That is the open item, not
a bug in the above. See [[pv-money-classification]] for how a line's `component` gets classified
once one is finally written.
