---
name: receipt-lifecycle-spec
description: "Owner's receipt PENDING→APPROVED→VERIFIED spec (30 Jul 2026) with all 3 decisions ANSWERED — do not re-ask. Prerequisite shipped (7577887); the feature itself is NOT built. Includes what to build and the traps."
metadata: 
  node_type: memory
  type: project
  originSessionId: 049ec23c-4a13-4d43-8871-f60655701048
  modified: 2026-07-30T13:46:16.480Z
---

**Owner's spec, 30 Jul 2026. All three decisions ANSWERED — do not re-ask.**

🟢 **COMPLETE.** Backend `ab92624` (migration `0074`) + live-fire fix `9014b5d`, agency screen
`24ad140`, PR's two mobile sections `92b5223`. Prerequisite was `7577887`.
⚠️ **The PR half has never been RUN** — mobile tsc 0 is the whole of that claim.

## The flow

`PENDING` → agency reviews the receipt (**photo + PR note**) on the **this-week** PV and may **edit
price / quantity** → `APPROVED` (the PR sees "APPROVED", and **only now may they dispute it**) → if
disputed: resolve → `VERIFIED`. Untouched through week close: `APPROVED → VERIFIED` **automatically**.

**Section placement:** approve appears in the PR's **this-week** section; **dispute in last-week.**

## The three answers

1. **Approval = the agency reviewing the this-week PV's receipts.** The dispute precondition applies
   **only to receipt-backed money — wages stay disputable with no approval**, or a wage error could
   never be contested. (Owner accepted this recommendation.)
2. **A PENDING receipt BLOCKS the send**, routed through the existing `voucherSendGate()` so there is
   one refusal path, not two that can disagree. Consequence: by the time a PR sees a *sent* last-week
   voucher, every receipt in it is already APPROVED — which is what makes #1 and the section split
   self-consistent.
3. **Only `source='manual'` starts PENDING.** OCR `scan` (and auto-sealed `checkin`) go straight to
   APPROVED — nobody self-declared them, and the PR can dispute if something is missing. **The existing
   `source` column comment already said "scan (OCR, auto-verified)" and needs NO correction** — I
   proposed changing it and was corrected.

## Prerequisite — DONE `7577887`, and it was a live data-loss bug

`PUT /payment-voucher/:id` replaces the whole line set, and `toLineRows()` never mapped `receipt_id` or
`proof_photos`, so **one agency price edit nulled every receipt link and DELETED the PR's proof
photos** — the evidence this feature exists to review. Fixed by carrying both across the wipe on a
**unique-`ref`** match (ambiguous refs skipped: attaching a receipt to the wrong money is worse than a
null), plus accepting both explicitly in the API. Live-proven on voucher `7bf3962e`.

## How it was built — decisions worth not re-litigating

- **No `rejected` state.** An agency that disbelieves a receipt EDITS the line to what it should be
  and approves that, leaving the PR a figure they can contest. A rejection is a refusal with no
  number attached and nothing to dispute.
- **`verified` is not settable over HTTP** (schema + server both refuse). Jumping there would shut
  the dispute window before the PR saw the figure.
- **Editing a line on an APPROVED receipt drops it back to PENDING.** The receipt table holds **no
  amount**, so unlike a day's `approved_total_cents` its staleness cannot be detected afterwards —
  it has to be recorded at the moment of the edit.
- **The rollover skips vouchers with an OPEN dispute**; `resolveDispute` closes them instead, when
  the last claim is decided.
- **The line edit is `PATCH /payment-voucher/receipts/:receiptId/lines/:lineId`**, never `PUT /:id`
  — see [[line-rewrite-drops-columns]].
- **A PR may not edit or delete a line once its receipt is approved** (409 pointing at the dispute).
- **The agency screen is the receipts card in `PayrollVerifyPanel`**, fed by the receipts that ride
  on `GET /payment-voucher/:id` — NOT the cross-voucher `GET /payment-voucher/receipts` feed. The
  spec puts the review on the this-week PV, and sharing the detail read is what keeps the send gate,
  the day panel and this card from disagreeing.
- ⚠️ **Every DTO path that returns a line must pass the receipt-status map.** `PATCH /mine/lines/:id`
  did not, and answered `disputable: true` for a pending receipt — fixed in `9014b5d`. Same failure
  shape as the four fake drinks: a field with nothing behind it invents a plausible value.

## Live proof (30 Jul) — `TEST_SCRIPT.md` §8 X21

9 checks, real agency + PR logins, shared DB restored afterwards. Two paths deliberately NOT fired
because they leave permanent rows: **a send that succeeds**, and **a dispute that succeeds**.

## The PR's two sections (`92b5223`) — mobile

Shared logic in `apps/mobile/src/lib/receipt-review.ts`: `receiptReviewCaption`, `cellDisputable`,
`isReceiptLocked`. **`disputable` is ADVISORY** — it greys a control; `raiseMyDispute`'s 409 is the
rule.

- **This week:** a caption — `2 approved · 1 still waiting on your agency` — and **nothing at all**
  when there are no receipts.
- **Check-in receipt rows:** badge **Approved** (not "Matched") when the receipt says so, and the
  edit / rescan / delete controls **disappear** — the server refuses all three, and those buttons
  were the only thing saying the row was still the PR's.
- **Last week:** a dispute on a still-pending receipt is refused with a sentence naming the day and
  the row. **Withdrawing is never blocked** — that would trap a claim already raised.

⚠️ **The editable numbers (price/quantity) live on `payment_voucher_line`, NOT on the receipt** — the
receipt table holds no amounts. That is why the prerequisite mattered.

✅ **One interlock already works:** an agency price edit changes the day total, so
`approved_total_cents` flips that day **STALE** and forces re-approval — see [[pv-day-review]].
