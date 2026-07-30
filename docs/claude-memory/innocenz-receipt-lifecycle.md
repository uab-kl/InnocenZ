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
- **Approval is the precondition for disputing receipt-backed money.** **Wages are exempt and always
  disputable** — they are sealed at check-out with no receipt to approve, so requiring approval there
  would make a wage error the one thing that could never be contested.
- **APPROVED → VERIFIED** on the Monday rollover, which runs **before** the gate (after it, every
  week's receipts would sit an extra seven days at approved — a whole cadence skipped, invisibly). It
  **skips vouchers with an open dispute**; `resolveDispute` closes those instead, when the last claim
  is decided.

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
