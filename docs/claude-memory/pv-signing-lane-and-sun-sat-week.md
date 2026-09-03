---
name: pv-signing-lane-and-sun-sat-week
description: "3 Aug 2026 — the payroll week is now Sun-Sat everywhere, the agency can finally SIGN and PAY, and the PR's History shows closed weeks. Carries the one mistake I made three times in a day: widening a query invalidates every consumer that inferred a fact from its old narrowness."
metadata: 
  node_type: memory
  type: project
  originSessionId: 29de2b56-d8d8-46cb-9d72-fd36dd969b71
  modified: 2026-08-03T05:06:27.372Z
---

**HEAD `aa572c8` on branch `SL`, tree clean, 8 unpushed.** Three commits: `3dc47a4` (week
re-anchor + migration 0080), `c3ffae5` (backend), `aa572c8` (web + mobile + TEST_SCRIPT).

## ⚠️ The lesson — I made this mistake THREE times in one session

**Widening a query invalidates every consumer that inferred a fact from its old narrowness.**

I changed `/payment-voucher/mine/history` from `signed`+`paid` to every closed week. Three separate
places had quietly encoded "anything in History is signed":

1. `payment-history-map.ts` — `v.status === 'paid' ? 'paid' : 'signed'`, so unsigned vouchers
   rendered **"Signed"** with `pr_signed_at` NULL, on the one screen a PR opens *to check whether
   they signed*.
2. `PvDetailScreen` — `alreadySigned = hist ? true : false`. A voucher the agency sends **late**
   appears only in History (it is not last week, so not on the Payment screen), so it arrived
   **sealed with nowhere to sign it**.
3. My own fix to (2) then over-corrected: I mapped every non-signed History voucher to
   `awaiting_pr`, which offered a Sign button on `pending_review` vouchers the server answers with
   `400 · "This voucher has not been sent to you yet"` — the PR draws a signature to be told no.

The owner found (2) and (3), not me. **"Not signed" is two states** — *waiting for the agency to
issue* vs *waiting for your signature* — and collapsing them caused both. When widening any query,
grep every consumer for assumptions the old filter made safe.

## The payroll week is Sun–Sat everywhere (owner's instruction)

Backend and PR app were Mon–Sun; the agency portal was Sun–Sat. The same money read
`27 Jul – 02 Aug` on the phone and `26 Jul – 01 Aug` on the web. Changed **together, as one
decision**: `weekBounds()`, `previousCompleteWeek()`, `weekOfDate()`, mobile `weekRangeLabel()`, and
the payout cron **`0 2 * * 1` → `0 2 * * 0`** (a Sun–Sat week ends Saturday, so a Monday run issues
a day late and fires mid-week; Sunday also matches the "PV issued every Sunday" copy on four
screens).

`src/scripts/reanchor-voucher-weeks.ts` migrated the live rows — report-only by default, `--apply`
to write, and it **refuses the whole run** if any line would fall outside its voucher's new window.
Checked first: **every live line is a Wed or Thu, none on a Sunday**, so re-anchoring moved **zero
money between vouchers**. All 3 vouchers shifted back one day; re-running reports "already Sun–Sat".

⚠️ A **Sunday-dated line is the only case that moves money** between vouchers under this change.
There were none. If more data has accrued since, re-run the report before assuming that still holds.

## The workflow rail was two-fifths decorative

`Raise PV → Finance sign → Sent to PR → PR signed → Paid`. **"Finance sign" and "Paid" had no
action behind them at all.**

- `finance_head_name` / `finance_head_signed_at` existed and **nothing ever set either** — while the
  PR app printed *"Finance Head already signed"* as hardcoded copy. Now: migration **0080** adds
  `finance_head_signature` (mirrors `pr_signature`/0071), `POST /payment-voucher/:id/finance-sign`
  behind `agencyOwnerOrFinance`, and **`PUT` refuses `pending_review → sent` with 409 while
  unsigned**. Separate endpoint on purpose: `PUT /:id` deletes and re-inserts every line, so signing
  through it would make an attestation a side effect of an edit. Signer's name comes from the
  session, never the body. Re-signing after send is refused.
- **"To pay" → "Paid" had no button**, though the card has always said *"use To pay to record each
  bank transfer"*. The backend already supported it (`PUT {status:'paid', bankRef}` stamps `paid_at`
  only when unset — that IS the "duplicate payment blocked"). UI-only fix.
- `PrSignaturePad` had **zero importers** — dead code, now live, extended with an optional
  `onConfirmInk` emitting stroke points (the backend stores strokes, not a bitmap).

## Wage lines were classified as "Others" in THREE different ways

The weekly generator writes `ref = <assignment id>` (bare uuid, no packed kind) and sets
`component: 'wages'` explicitly. Three consumers each derived the bucket differently and all got it
wrong — **RM 2,600 of wages displayed under Others; every "daily wages" figure read RM 0.00**:

- `toReceiptLineDTO` + `sumWages` (backend, PR-facing) read `ref` only → new `lineKind()`: a packed
  ref still wins, the `component` column answers only when the ref packs nothing.
- `pv-breakdown.ts` (agency web) **string-matched the description** for "wage", so a line described
  *"Friday lounge"* fell to Other. Now reads `component`; the text search survives as fallback.

The database was right the whole time. ⚠️ Changing `kind` is safe for disputes: a wage line carries
no receipt, so `receiptStatus === null` already made it disputable.

## Agency Receipts tab now reads the database

It rendered the demo Zustand store (empty on every real login) while
`GET /payment-voucher/receipts` had shipped with the review flow and had **zero web callers** — the
repo's #1 bug class, [[demo-data-leaks-into-real-sessions]]. New `AgencyReceiptsPanel`: stat tiles,
status chips, day grouping, proof photos that **enlarge on click**, Approve/Withdraw on the same
endpoint as the per-voucher panel. Live: 2 receipts on PV-000003.

## Payment Week was hiding money it could not pay

It filtered to `SIGNED` — the right *expectation* enforced the wrong way. It is the **only** tab
whose window contains a two-week-old voucher, so an unsigned one was invisible on all three tabs:
**RM 875.00 that could not be reviewed, sent, or therefore signed**, with nothing anywhere saying
so. Now shows the week and flags what is unsigned; "To pay" still isolates the payment run.
Disputes/Overtime tabs are hidden on that week (owner's rule) — but stay deliberately **not**
week-scoped elsewhere, since a claim blocks whichever week it belongs to.

## ⚠️ Never verified by clicking

Signing in requires entering a password, which I do not do on the user's behalf. **Everything here
is compiler- and database-verified only.** The finance-sign round trip (draw → confirm → Send
enabled) is the first thing to exercise. `tsc`: backend 0, web 121 (baseline), mobile 10 (baseline).

Also: I damaged the working tree with a needless `git stash` probe — a failed `push` meant the
`pop` applied an **unrelated old stash**, leaving conflict markers in 3 untouched files. Recovered
with `git restore --source=HEAD`. **`git checkout` is gate-blocked; `git restore` is not.** Do not
manipulate git state to answer a question a file read would answer.

See [[migration-journal-corrupt]] (generate is broken — hand-author every migration),
[[pv-lane-live-verified]], [[client-readiness-verdict]].
