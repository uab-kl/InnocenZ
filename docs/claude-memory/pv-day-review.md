---
name: pv-day-review
description: "Agency day-by-day PV sign-off (ef45445 / migration 0072) — the 3 design rules that make it mean anything, what is live-verified, and the 2 owner decisions + frontend still open"
metadata: 
  node_type: memory
  type: project
  originSessionId: e6a0525f-ec3a-44a2-bf33-e24471117ad8
  modified: 2026-07-30T12:01:32.582Z
---

**Backend shipped 30 Jul 2026, `ef45445`, migration `0072`. The agency panel is NOT built.**
Sits between voucher generation and issue: `generate → day review → send → PR signs → paid`.

## The three rules that make it mean anything — do not "simplify" these

1. **Keyed to `review_date`, NEVER to a `payment_voucher_line` id.** Lines are deleted and
   re-inserted wholesale on every voucher update, so a line-keyed review is destroyed by the next
   regeneration. Same trap already documented on `payment_voucher_dispute` (0051).
2. **`approved_total_cents` stores the day's total AT APPROVAL, computed server-side.** Never accept
   it from the client — it is the baseline of a money attestation. Readers recompute the day and
   treat a mismatch as **STALE**, dropping the day back to unreviewed. Without it, a day signed off
   at RM 300 that regenerates to RM 420 still reads "approved" and the agency has attested to a
   figure the PR was never sent. Integer cents, like the Σ=0 check.
3. **There is no `pending` state.** No row = never reviewed; un-reviewing DELETES the row. Storing
   pending rows would mean pre-creating one per day and keeping them in step with a rewritten line
   set.

**Granularity is per-DAY while disputes are per day AND component — on purpose.** The agency reviews
a day as a unit (components are the evidence inside it); a PR contests one component. So approving a
day means *"I checked this"*, not *"this can no longer be challenged"* — a PR may still dispute a
component of an approved day, and that is not a contradiction.

## Surface

- Read rides on **`GET /payment-voucher/:id`** beside the receipts (→ `dayReviews[]`,
  `allDaysReviewed`, `hasHeldDay`). Deliberately not its own path, so decisions cannot disagree with
  the lines they refer to.
- `PATCH /payment-voucher/:id/day-review/:date` → `{status: 'approved'|'held'|null, note?}`.
  `null` un-reviews. Body carries **no amount** by design.
- `POST /payment-voucher/:id/day-review/approve-all` — records `bulk: true` so it stays
  distinguishable from days opened individually, and **skips HELD days** so it cannot quietly
  overturn a refusal.
- Reviewing an **already-signed** voucher is **409** — the ordering is the whole point.
- `hasHeldDay()` in the repository **fails CLOSED** (an error reports "held"), because callers use it
  to decide whether a voucher may be sent.

**Trap:** `allDaysReviewed` can be `true` while `hasHeldDay` is also `true` — a held day IS a
decision. Send-readiness must read `hasHeldDay`, not `allDaysReviewed`.

## Verified vs not

**Live-verified** on a real agency login (test rows cleaned up): hold-with-note; approve-all
approves the rest and reports *"1 day(s) approved · 1 held day(s) left untouched"*; baselines match
day totals; unknown day 404, bad status 400, PR token 403; un-review returns to clean. Table
confirmed in the shared DB **by direct query** — `drizzle-kit generate` aborts on a pre-existing
0065–0070 snapshot collision, so `0072` was hand-written (idempotent, `when` above `0071`).

**NOT fired live: the stale path.** Needs a voucher regeneration after an approval — a destructive
write on a shared DB. Logic, not evidence.

## Both decisions ANSWERED 30 Jul — gates shipped `4681fb3`, live-verified

- **A held day BLOCKS the send, AND every money-bearing day must be decided.** The owner chose the
  strict form over my warn-only recommendation. One shared `voucherSendGate()` in
  `payment-voucher-day-review.ts`, used by **both** `PUT /payment-voucher/:id` and the Monday
  `weekly-payout` job — exempting the scheduler would have left the sign-off as something a cron
  overrules weekly. Three things not to "simplify": a **stale** day counts as unreviewed; a voucher
  with **no dated lines passes** (week-level lines belong to no day, so blocking is a deadlock, not a
  control); and **lines + `status:'sent'` in one call is refused**, or the gate judges old totals and
  ships new ones.
- **Owner AND finance may approve** — `agencyOwnerOrFinance` on the two write routes. Identical to
  the org-level guard today, and named precisely because of that: a future third sub-role must be
  granted money authority on purpose, not inherit it. **The READ is deliberately ungated.**

⚠️ **Consequence now live:** the payout job holds unreviewed vouchers at `pending_review` and the PR
is never notified. Intended — but until the panel exists there is no screen to review on. Watch for
`awaiting agency day review` in the job log the first Monday after this ships.

## ✅ THE PANEL SHIPPED — `51788dc`, 30 Jul, live-verified through all four gate states

`use-agency-pv-day-review.ts` + `AgencyPvDayReviewPanel.tsx`, rendered in `PvDetail` above the
receipt-evidence panel, with the **send button disabled and the reason printed under it**.

**⚠️ CORRECTS the earlier instruction in this memory — do NOT gate on `hasHeldDay`.** The write
endpoints (`PATCH …/day-review/:date` and `…/approve-all`) return **`dayReviews` + `allDaysReviewed`
only — no `hasHeldDay`**. A gate reading that flag goes blank the instant a hold is recorded, which is
the moment it matters. `buildSendGate()` derives from each day's own `status` instead (held → block,
null → block), mirroring the server's `voucherSendGate()`. `allDaysReviewed` remains the wrong answer
for the original reason: it is true when every day is decided *and one is held*.

Rules baked in — do not "simplify" these either:

- **The panel and the evidence panel share one query key** (`pvEvidenceKey`, exported from
  `use-agency-pvs.ts`) — one voucher on screen = one request, and a decision refreshes both, so they
  cannot show decisions beside lines from a different read.
- **Renders nothing when `isBackedVoucherId(id)` is false** (demo ids like `pv1`). Zero days beside
  real-looking amounts would read as "nothing to sign off", not "not applicable".
- **While the fetch is in flight the gate is CLOSED with no caption.** Open would offer a send we
  cannot yet say is legal; a caption would be a guess.
- **Approving CLEARS the note.** Found live: approving a *held* day carried the hold's note onto the
  approval, leaving the record reading *"Approved · Note: &lt;the reason it was held&gt;"* — an
  attestation justified by the argument against making it. The textarea asks why a day is HELD.

**⚠️ The panel is only reachable by deep link** — [[payroll-list-hides-real-vouchers]]. The Payroll
list drops every real voucher, so verify with `/en/agency/pv?pv=<uuid>`.

## Still open
- ⚠️ **NOTHING NOTIFIES THE AGENCY that a voucher is waiting.** The payout job holds it and logs
  `awaiting agency day review`; no notification fires. The panel shows the queue to someone who goes
  looking, but nothing makes them look. **A new notification kind is the user's call — raise it
  before calling this feature done.** See [[notification-producers]] for the existing 6 kinds.
- **The STALE path** still never fired live.
- `reviewPaymentVoucherDay()` sends **no amount** on purpose — the server recomputes the day as the
  approval baseline. Do not "helpfully" add one; it would let a client approve a figure the voucher
  never had.
