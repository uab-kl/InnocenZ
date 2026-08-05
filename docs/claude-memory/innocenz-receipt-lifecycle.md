# Receipt lifecycle + voucher numbers

Shipped 30 Jul 2026, migrations **0074** and **0075**. Extends `innocenz-pv-pipeline.md`, which
describes the weekly voucher itself.

## PENDING → APPROVED → VERIFIED

A self-logged receipt is the PR telling the agency what they sold. It used to be money the moment it
was written. Now `payment_voucher_receipt` carries `status` (`pending|approved|verified`),
`reviewed_at` and `reviewed_by`.

- **Only `source='manual'` is born PENDING.** An OCR `scan` and a check-in seal were not
  self-declared, so holding them would block a week on evidence nobody disputes.
- **A PENDING receipt blocks the send**, through the *existing* `voucherSendGate()` rather than a
  second check — one refusal path cannot disagree with itself. Consequence: by the time a PR reads a
  *sent* voucher, every receipt on it is approved.
- **Approval is the precondition for disputing receipt-backed money.** ⚠️ **SUPERSEDED 4 Aug 2026 —
  the wages exemption is GONE.** Only **drinks and tips** are disputable, and only once the agency
  has **approved** the receipt. **Daily wages and Others (OT, deductions) cannot be disputed at all** —
  the owner's reason: they are *fixed by the outlet*, derived from the check-in/check-out stamps and
  the shift rate, so the route to fixing one is the attendance record, not a claim. The PR can still
  **view the proof** on those rows; they just cannot contest the figure. One rule, two callers:
  `lineDisputable(kind, receiptStatus)` in `payment-voucher-component.ts` feeds both the `disputable`
  flag the app reads and the 400 in `raiseMyDispute`.
  *(The old rule, for the record: wages were sealed at check-out with no receipt to approve, so
  gating them on approval would have made a wage error uncontestable. Cost of the reversal: in-app,
  it now is.)*
- **APPROVED → VERIFIED** on the **SUNDAY 02:00 Asia/Kuala_Lumpur** rollover — ⚠️ this file said
  *Monday* until 4 Aug 2026 and that was stale: the payroll week was re-anchored to **Sunday–Saturday**
  on 3 Aug (owner's instruction), and the cron moved with it, because the week anchor and the cron day
  are one decision. `previousCompleteWeek()` is the authority. It runs **before** the send gate (after
  it, every week's receipts would sit an extra seven days at approved — a whole cadence skipped,
  invisibly). It **skips vouchers with an open dispute**; `resolveDispute` closes those instead, when
  the last claim is decided.

### Approving a DAY approves its receipts (4 Aug 2026, no DDL)

The two reviews were never independent: a day's `approved_total_cents` IS the sum of its lines, and
those lines are the receipts' lines. An agency approving RM 3008.20 for Tue has already stated the
receipt behind it is right — yet the gate still blocked the week on *"2 receipt(s) not yet reviewed"*.

- `receiptsCarriedByDays(lines, receipts, approvedDates)` in `payment-voucher-day-review.ts` is the
  rule. A receipt is carried only when **every** day it touches is approved (a Mon+Tue receipt waits
  for both), and a receipt with **no dated lines is never carried** — `dayTotalsCents` skips undated
  lines, so no day's total ever contained its money.
- `approvePendingReceipts(ids, actor)` writes it in ONE statement that re-asserts `status='pending'`
  in the WHERE, so a receipt approved between the read and the write keeps its real reviewer.
- Both `reviewDay` and `approveAllDays` sweep from the FULL set of approved days, never just the day
  decided — otherwise the spanning receipt clears in one working order and not the other.
- **Withdrawal is NOT symmetric.** Holding or clearing a day does not un-approve its receipts;
  dropping a receipt back to pending stays a deliberate act in the receipts panel, where the photo is.
- The day-review panel says this out loud. An attestation made without opening the receipts panel has
  to be visible, or it is a trap.
- PR side: `/mine/current-week` + `/mine/last-week` ship `dayReviews[{date,status}]` — date and status
  ONLY — so an approved day reads **APPROVED** on the phone mid-week. Before this the app could only
  see the voucher's own status, which sits at `pending_review` until Sunday.
- **`prVisibleDayStatuses()` is the pessimistic half of the same rule**: a day drops back to `null`
  for the PR when any PENDING receipt has a line on it. The two states CAN disagree — a receipt
  straddling an unapproved day is held back by design, and a day approved before the carry existed
  never swept — and the phone must never claim settled money it cannot back. APPROVED is what unlocks
  the **dispute**, so over-claiming points the PR at a 409 naming a receipt they cannot see.
- Legacy days do not self-heal on read (a GET must not write). `repair-day-approved-receipts.ts`
  replays the same pure rule over every unsigned voucher — **dry run by default**, `--write` applies.

### Rules not to re-litigate

- **No `rejected` state.** An agency that disbelieves a receipt edits the line to what it should be
  and approves *that*, which leaves the PR a figure they can contest. A rejection is a refusal with
  no number attached and nothing to dispute.
- **`verified` is not settable over HTTP** — jumping there shuts the dispute window before the PR
  ever saw the figure.
- **Editing a line on an APPROVED receipt drops it back to PENDING.** The receipt table holds **no
  amount**, so unlike a day's `approved_total_cents` its staleness cannot be detected afterwards; it
  has to be recorded at the moment of the edit.
- **A PR cannot edit or delete a line once its receipt is approved** — the route back is the dispute,
  which approval is exactly what unlocks.
- The agency's correction is `PATCH /payment-voucher/receipts/:receiptId/lines/:lineId`, **never**
  `PUT /payment-voucher/:id` — that wholesale path replaces the line set and once deleted the PR's
  proof photos.

Endpoints: `PATCH /payment-voucher/receipts/:receiptId/review` (`pending|approved`) and the line
correction above, both under `agencyOwnerOrFinance`. Agency UI: the receipts card in
`PayrollVerifyPanel`, which shows the **proof photo and the PR's note** — neither was on screen
before. PR UI: a this-week caption plus **Approved** badges (edit/delete controls disappear), and
last-week refuses a dispute on an unreviewed receipt.

## Voucher numbers: `PV-000001` (migration 0075)

The "Voucher No." was **derived** as `PV-<weekEnd>` in FIVE places — the backend export plus four in
the PR app — so every PR's voucher for a week shared one number and one download filename. It is now
a stored `payment_voucher.voucher_no`, allocated on insert exactly like `RCP-000001` receipt numbers,
and **every surface reads it**. The week is still printed on the document.

The column is nullable on purpose: it is unique, a NULL never collides, and a failed allocation must
leave a voucher *unnumbered* rather than uncreated — an unnumbered voucher can be repaired, an
uncreated one is somebody's missing pay. Watch the log for `Could not allocate a voucher number`.

Also fixed at the same time: the exported workbook's money cells were `.toFixed(2)` **strings**, so
the Amount column of a payment voucher could not be summed. They are numbers with a `#,##0.00`
format now — **verified by opening the file, which is how the defect was found in the first place.**
