---
name: voucher-never-checked-against-source
description: "🔴 BLOCKING (31 Jul 2026): the money is WRONG. A week worth RM703.60 produced two vouchers totalling RM2,285.08, and the correct one is the one still unsent. Wages for an unworked day, 113h OT on a 6h slot, a line 6 weeks out of range, one drink paid twice. Nothing compares a voucher to its source records"
metadata: 
  node_type: memory
  type: project
  originSessionId: 616eb9bd-5bd6-473d-a6c8-bd7e3849b0fd
  modified: 2026-07-31T05:30:42.690Z
---

**The first time anyone asked "is the number right?" instead of "does the endpoint respond?"** —
31 Jul 2026, prompted by the owner's boss wanting a test run. `TEST_SCRIPT.md` §8 X36, §9 **P0**.

## The method — this is the reusable part

Pull the **primary records** (shift assignments + statuses + stamps + sealed `payAmount`, the outlet
`tier_rate` card, receipt sales) and **recompute by hand**. Do **NOT** re-run the app's arithmetic:
an implementation checked against itself always agrees. Everything below came out of one read-only
dump plus mental arithmetic, in about an hour.

## What it found — Victoria Tan Mei Lin, tier_3, week of 27 Jul

Of 8 assignments, exactly **one** is in that week and `completed`. Tier III = **700.00** at all 7
outlets. **The week is worth RM 703.60.** The app produced **two vouchers totalling RM 2,285.08**,
and **the correct one (`PV-000004`, 703.60) is the one still unsent.**

`PV-000002` — **already `sent`** — RM 1,581.48:
- **700.00 wages dated 28 Jul**, a day whose assignment is `assigned` with **no stamps at all**
  ⚠️ this one rests on the assignment list — confirm via the `f5a1f22` ref before repeating it
- **"Overtime 113.1h @ RM6.00/h" = 678.78** on a **6-hour** slot. 113h of OT in a 168h week is
  impossible; and 678.78 ÷ 6.00 = **113.13**, so the label rounds where the money does not
- a drink line dated **2026-06-16** on a week-of-27-July voucher
- the same Lemon Drop **paid twice** — `ORD0389` vs `ORDO389`, letter O against digit zero from OCR,
  so dedupe saw two orders

**`PV-000001` is `signed`** (a PR accepted it) **and its wages 198.00 / 186.00 match no tier rate**
(card: 500/600/700/825/1000/200). Commission moves 15%→12% across days, tips 10%→17%, unexplained.

## The actual finding

**Nothing anywhere compares a voucher against the records it was built from.** One assertion at
generation time catches every fault above:
1. wages lines == `completed` assignments × that PR's tier rate
2. every line's date inside `week_start … +6d`
3. no duplicate order refs (**normalise O/0, I/1, S/5 before comparing** — OCR produces exactly this)
4. OT bounded by the shift window — a stamp gap is not hours worked
5. one voucher per PR per week (a DB constraint, not a convention)

## ⚠️ The uncomfortable part: half of this was already known and under-ranked

[[pv-money-classification]] already recorded *"exposed the unbounded overtime bug (RM678.78 '113.1h'
still on a live voucher)"* — **days earlier, on this exact voucher.** It was written down as a
curiosity beside a classification fix and never ranked as blocking, so nobody connected it to the
question "is the payroll correct?". **A finding that is recorded but not ranked is not a finding.**
The duplicate voucher was likewise already in §9 as Vicky's `34364790-…`; what was missing was the
**amount**, and that **the wrong one is the one that was sent**.

## ✅ THE RULES ARE NOW CODE — `2cb70b8`, 31 Jul (§8 X37). 4 of 7 closed.

**`apps/backend/src/features/payment-voucher/payment-voucher-audit.ts`** — pure, integer cents,
never throws, mirroring `payment-voucher-balance.ts` (which answers a *different* question: a
voucher paying 700.00 for a day nobody worked **balances perfectly**). Two entry points, one rule:
`auditVoucher()` for the whole voucher, `checkLineAgainstWeek()` for the per-write guard.
It also checks the direction nothing else did — **a completed shift with no wages line is unpaid
work**. Proof: `src/scripts/probe-pv-audit.ts`, **pure and DB-free, 21/21** — kept, not deleted,
because in a repo with zero tests it is the only executable proof of the money rules.

### 🔴 The correction — the LOCATION was wrong, here and on the audit page

Item 7 above says *"one assertion at **generation time**"*. **That is false.** Building to it would
have put the check in the one place none of the faults can reach:

- `listCompletedForAgencyWeek` **already** filters `status='completed'` **and**
  `shift_date BETWEEN weekStart AND weekEnd` — the generator can emit neither an unworked day nor
  an out-of-week line.
- Every fault on `PV-000002` came from the **PR SELF-LOG path** (`addMyLine` / `addMyReceipt`),
  which appends to a draft with a **client-supplied `lineDate`** and no window check at all.

**The finding's own conclusion was the misleading entry** — see [[audit-entries-are-leads]], which
now has an instance where the bad lead was the *diagnosis*, not a stale status line.

### The duplicate voucher had a MECHANISM, and nobody had named it

`getOrCreateCurrentWeekDraft` looked up the draft with **`status='pending_review'` only**. So once a
week's voucher had been **sent**, it was invisible to that lookup and the next self-log created a
**second voucher for the same PR and week** — exactly how `PV-000002`(sent) + `PV-000004`(pending)
both exist. Now checked across **every** status; a closed week answers **409**. Appending to the sent
voucher instead would silently rewrite a document the PR already holds.

Also: `findReceiptByOrderNo` folds OCR confusables (**O/0, I/1/l, S/5, B/8, Z/2**, case, separators)
and compares **in JS, not `eq()` in SQL**. Per-shift scoping unchanged — outlets really do reuse
order numbers across nights.

⚠️ The OT half was **already half-fixed and unrecorded**: `apps/mobile/src/lib/pr-rate.ts` bounds the
hours and had corrected the *"@ RM6.00/h"* bug (`standard_shift_hours` spent as ringgit). The missing
half was **the server, which accepted whatever the phone sent**.

## 🔴 THE LIVE RUN — `6d0b1cf`, §8 X38. **3 of 4 fail, and it beat the hand-check.**

`apps/backend/src/scripts/audit-live-vouchers.ts` — **read-only** (`db.select()` only), ten seconds,
re-runnable. It loads every assignment for the PR in that week **regardless of status**, which the
generator's own call cannot do: it holds only completed rows, and **an unworked day is invisible to a
query that selects only worked ones.**

**Two faults nobody had seen, the same shape both times — THE DAY ACTUALLY WORKED IS UNPAID:**
- `PV-000002` pays 700.00 for **28 Jul (`assigned`)** while the **completed 30 Jul (`ab4a53ae`)** has
  **no wages line**. Wrong day paid *and* the real day unpaid.
- `PV-000001` (**`signed`**) puts wages on **21 + 22 Jul — days with no assignment at all** — while
  the **completed 23 Jul (`f5a1f227`) is unpaid**. **This answers the `f5a1f22` question** the
  original finding left open, and reframes *"wages match no tier rate"*: the amounts are not merely
  unexplained, they are **attached to days that never happened**.

✅ **`PV-000003` is CLEAN** — the first voucher on this project confirmed correct by machine rather
than asserted. Everything from the hand-check reproduced exactly (`ORDO389` = `RCP-000003`/`004`,
OT 678.78 vs a **0.00** stamp budget, the 2026-06-16 line, the duplicate pair from both sides).

**Two unpaid completed shifts are money OWED, and no voucher repair settles them.**

## Round 2 — `17480d7` + `19333f2` (same day)

**I closed only half the duplicate hole the first time.** `POST /payment-voucher/` (agency create)
had **no `existsForPrWeek` check and no line-date validation** — and that is the *likelier* origin of
the live duplicate, since `PV-000002` was raised and sent from the **agency** side, not by a
self-log. Guarded now on create *and* on update's line rewrite (checked against the week the voucher
**will have**, so moving week+lines in one call is not judged against the old window).

**`checkVoucherBalance` disagreed with the whole system about `amount`.** It computed
`Σ(amount × quantity)`, but **`amount` is the LINE TOTAL** — `recomputeTotals` sums it bare and the
exports derive unit price as `amount ÷ quantity`. The first multi-item receipt would have made a
**healthy** voucher log *"DO NOT BALANCE — hold payment and review"*. Latent only because every live
line carries quantity 1. **A check that cries wolf is worse than no check.**

**The money-WRITE routes were the least-gated on the router** — authoring a voucher required less
than reviewing one. Both now `agencyOwnerOrFinance`; callers verified first (`createPaymentVoucher`
has **no frontend caller at all**). Also: the "agency can DELETE a PV" note in
[[backend-gap-audit-verified]] is **stale — already fixed**, `canDelete = requireRole('admin')`.

### Migration 0076 — applied and verified live

Bank details (`user_profile.bank_name`/`bank_account_no`) + `agency.address_line_1/2`, wired end to
end: model, the `user_profile` join in `getExportBundle`, all three export surfaces, and
`PATCH /user/:id` (self-edit only). **On `user_profile`, not `pr`** — that table already holds
IC/DOB/address and is already the one `redactIdentityDocsForOutlet` blanks, so a venue cannot see a
worker's account number; **both fields went into `IDENTITY_DOC_FIELDS` in the same commit, because
that helper blanks what it NAMES.** Verified 9/9 columns by `information_schema` **and** by calling
`getExportBundle` — drizzle-kit saying "applied" is not proof ([[green-signals-that-lie]]).

⚠️ **OVERTIME IS SCHEMA-ONLY.** Five columns exist, **nothing writes or reads them**. Owner already
answered both policy questions — **approver = `agencyOwnerOrFinance`, rate = derived `daily ÷ 6 ×
1.5`** — so do not re-ask. Left to build: check-out recording `overtime_minutes` (the clamp destroys
the evidence), the approve/reject endpoint, the `component='ot'` line on approval, a screen — **and
one real design question: what an approval does when that week is already `sent`**, since the new
duplicate guard 409s it.

⚠️ **An auto-commit hook fires mid-slice in this repo** and writes its own `TEST_SCRIPT` entries
describing the state *at that instant*. It left X40 claiming the migration was unapplied minutes
after it was applied. **Re-read TEST_SCRIPT before trusting a fresh entry you did not write.**

## ✅ RESOLVED 31 Jul — owner called it TEST DATA, wipe + regenerate. 3 of 3 now OK.

**The decision:** these vouchers are not payroll anyone is owed, so all three repair questions
collapse into one act. `PV-000001`/`PV-000002`/`PV-000004` deleted, weeks 2026-07-20 and 2026-07-27
regenerated, `audit-live-vouchers.ts` now reports **0 flagged**. ⚠️ **For REAL payroll the rule is
different and is now decided in advance: VOID + REISSUE, PR notified — never a silent in-place edit.**
Tool: `src/scripts/wipe-test-vouchers.ts` (dry run by default, refuses to run unscoped).
⚠️ **Scope by `--pr`, never `--week-start`:** the clean `PV-000003` shares a week with two bad ones
and belongs to a *different* PR.

**Also decided:** an **admin MAY** resolve a PV dispute, as an escalation path only — Option A. The
sub-role hole is closed in the same edit (`agencyOwnerOrFinance` on the resolve route); `guard()`
waves admin through by design, so that narrows agency members without shutting the escalation.

### 🔴 The write path is FINALLY known — and the hole is still open

Read `payment_voucher_line.created_by` + `ref` **before** wiping (`--show-lines`). Every line on all
three came from **`pr.vicky@innocenz.demo`, the PR self-log** — which **corrects the round-2 guess**
that `PV-000002` was raised agency-side (that was inferred from its `sent` status, not evidence).

**The mechanism: `lineDate` is client-supplied and is NEVER checked against the assignment its own
`ref` names.** `PV-000002`'s wages line is dated `2026-07-28` with ref `wages|checkin|700.00|f5a1f227…`
— and `f5a1f227` is the **23 Jul** assignment. **`checkLineAgainstWeek()` cannot catch this**: 28 Jul
is inside the right week. The fix is a new write-time assertion, **in the repository** so all four
insert paths get it: if `ref` carries an assignment id, require `lineDate === shift.shift_date`.

### 🔴 Two bugs the wipe exposed that nothing else could

1. **Voucher numbers were recycled on delete.** `nextVoucherNo` used `count(*) + bump`, so after
   deleting three the next voucher was issued **`PV-000002` — the number the deleted `sent` document
   held.** Two documents answering to one name, one of them already downloaded by a PR. Now
   `max(<numeric suffix>) + bump`.
2. **A catch-and-retry inside a Postgres transaction is a NO-OP.** The unique-clash retry could never
   reach attempt 2: a failed statement aborts the whole transaction, so the next SELECT returned
   `25P02`, which is not a voucher-no conflict and was rethrown. Each attempt now runs in a
   **SAVEPOINT**. **Worth grepping for other `try { insert } catch { retry }` inside `db.transaction`.**

Also: `generate-weekly-pvs.ts` never imported `@/env.js`, so it died with a *SASL client password*
error that names the auth mechanism instead of the cause. Fixed. **`run-weekly-payout.ts` has the
same shape and was not touched.**

## How to apply

- **The three live bad vouchers are NOT repaired — the code only stops new ones.**
  **Do not demo payroll** until the remaining three are settled: *which write path* wrote the 28 Jul
  wages (needs the live DB), `PV-000001`'s non-tier wages and the `PV-000002`/`PV-000004` merge
  (owner calls), plus a `(pr_id, week_start)` **unique constraint** so the rule outlives the code.
- **The next step is NOT another query — the audit has said everything a query can.** Run
  `npx tsx --tsconfig tsconfig.json src/scripts/audit-live-vouchers.ts` from `apps/backend` to see the
  current state at any time; then the three repairs are **owner decisions** on documents a PR already
  holds. Re-run it after any repair, and before any demo.
- Everything else on the audit is a *wiring* question. This one is the product's **output**.
- Related: [[pv-money-classification]] · [[ot-not-auto-paid]] · [[client-readiness-verdict]] ·
  [[pv-day-review]] · [[audit-entries-are-leads]] · [[line-rewrite-drops-columns]]
