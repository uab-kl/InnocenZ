---
name: line-rewrite-drops-columns
description: "RULE — a voucher update REPLACES every line, so any column the HTTP line payload does not carry is silently lost. Cost the PR's proof photos and every receipt link (fixed 7577887). Check this whenever a column is added to payment_voucher_line."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 049ec23c-4a13-4d43-8871-f60655701048
  modified: 2026-07-30T13:00:56.903Z
---

**`PUT /payment-voucher/:id` with `lines` DELETES every line on the voucher and re-inserts from the
payload.** So any column the HTTP line payload cannot express is **silently reset to its default** on
the next save — not rejected, not warned about. Lost.

**Why:** `payment-voucher.repository.ts` `update()` does `delete(...).where(voucherId)` then
`insert(lines.map(prepareLine))`, and the request body is shaped by `PaymentVoucherLineSchema` →
`toLineRows()`. A column absent from *either* is absent from the insert.

**What it cost (30 Jul 2026, fixed `7577887`):** `toLineRows()` mapped 6 fields and omitted
`receipt_id` and `proof_photos`, so **one agency price edit nulled the receipt link on every line of
the voucher and DELETED the PR's proof photos** — the mandatory evidence behind a self-logged claim,
and the exact thing the new receipt-approval flow reviews ([[receipt-lifecycle-spec]]). It also
explains the verify panel reporting commission lines as unbacked: after the first edit, they were.

**How to apply — do this whenever you add a column to `payment_voucher_line`:**

1. Add it to `PaymentVoucherLineSchema` (optional) **and** to `toLineRows()`, or
2. Carry it forward in `update()`'s pre-delete snapshot.

The current carry-forward matches on **`ref`**, and only for refs appearing **exactly once** on the
voucher — an ambiguous match would attach a receipt to the wrong money, which is worse than the null it
replaces. Pass `undefined` (never `null`) from the controller when the caller says nothing, or you
overwrite the carried value with an explicit blank.

**The proper fix is still open:** update lines in place by id rather than wipe-and-reinsert. The wipe is
load-bearing in several places, so it was left alone.

**Same root cause, already documented elsewhere:** this is why the day review is keyed to a **DATE**
([[pv-day-review]]) and why a dispute must **never** FK a voucher line ([[pv-dispute-design]]) — both
were designed around line rewrites. `line.receiptId` is precisely such an FK, so the codebase violated
its own rule in one place, and that is where the data loss was.
