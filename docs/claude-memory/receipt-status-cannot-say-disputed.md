---
name: receipt-status-cannot-say-disputed
description: "receipt.status is the AGENCY's review only, so an open PR claim rendered settled-green on three surfaces; the feed now carries disputes[] and an open claim OWNS the tag"
metadata: 
  node_type: memory
  type: project
  originSessionId: cad763b1-d0d9-459a-9522-772aec2aa01f
  modified: 2026-08-26T04:28:59.054Z
---

`payment_voucher_receipt.status` is `pending → approved → verified` — the
**agency's** review, with nowhere in it for what the **PR** thinks. Every
surface that coloured a figure from it therefore called a contested one
*settled*:

- agency Receipts sub-tab: a green **Verified** pill while the dispute queue two
  panels away showed the same paper Open;
- PR app, current-week grid: the contested **Drinks 105.00** in green while the
  header AND the Status cell under it both read DISPUTED — two surfaces out of
  three agreed and the third was the money.

Fixed 26 Aug 2026.

**Backend.** `listAgencyReceipts` attaches **`disputes[]`** per receipt, derived
server-side, because the dispute→receipt link is TWO rules: a claim either NAMES
a receipt (`receipt_id`, migration 0088) or names none and covers the whole DAY
+ bucket, in which case every receipt with a line of that date and kind is under
it. `listForVouchers()` is bounded by the feed's vouchers, never by a `limit` —
a cap would badge some rows and leave others bare while looking complete.

**Web.** Read through `agency-portal/lib/receipt-disputes.ts` (link) and
`receipt-status.ts` (tag), so the badge and the queue's evidence block cannot
disagree. **An open claim OWNS the tag** (owner's call): red "Disputed"
REPLACES the review pill rather than sitting beside it — a green VERIFIED reads
as settled, and two tags disagreeing leave the reader to arbitrate. The review
state moves to the row's "Reviewed by …" line. Filter chips partition the week
to match; the Approve-all banner keeps its own `pendingAll` count, because the
server sweep is `status = 'pending'` and knows nothing about claims.

**Mobile.** `cellReviewTone()` now returns `'disputed'` first, via the existing
`openDisputeKeys()` so there is one rule. The current-week grid also never
consulted `disputedCells` at all — the Last-week grid did, 400 lines above it.
Paint from `disputedCells`, not from the tone: that Set also holds the claim
raised SECONDS ago, so the cell turns red on submit rather than on the next
poll.

**The sibling defect, and the lesson.** Editing a receipt still stopped at
`status !== "verified"` in `DisputeQueuePanel` and `PayrollVerifyPanel` — the
rule the owner REVERSED on 23 Aug 2026, when the server and the Receipts sub-tab
were relaxed and these two were not. A scan verifies AT CREATION, so that test
hid the editor on every scanned receipt: the one screen where a claim is settled
was the one screen that could not correct the paper the claim was about. **When
a rule is relaxed, grep every copy of the old test** — [[fix-named-by-symptom-hides-siblings]].
The only real lock is the PR's signature, and an open claim already makes
signing impossible.

Proof without a login: `_probe-receipt-dispute-badge.ts` calls the REAL handler
with a stub req/res — see [[prove-guards-live-without-writing]] for why that
beats a fixture.
