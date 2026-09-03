---
name: overtime-bounded-by-clocked-time
description: "Overtime was measured from the scheduled end and never consulted check-in, billing hours the PR was absent for — now bounded by time actually clocked in"
metadata: 
  node_type: memory
  type: project
  originSessionId: 93d11136-6321-41ee-b369-237169aa90bc
  modified: 2026-08-04T02:40:23.693Z
---

**4 Aug 2026, commit `d827d0a` on `SL`. The last 🔴 P0 money bug from the 3 Aug sweep is closed.**

`overtimeFromStamps` (`apps/backend/src/features/shift-assignment/overtime.ts`) measured the
overrun **from the shift's scheduled end to the check-out clock and never consulted
`checkInAt`**. Assignment `6574b2ee` therefore claimed **279 minutes — RM813.75 — for 11.6
seconds** of attendance: slot `10:00–12:00`, check-in `08:38:58.504Z`, check-out
`08:39:10.090Z`. `12:00 + 279 min = 16:39`, the check-out stamp to the minute. Same mechanism
behind the live "113.1h" line on `PV-000002` and the 23 Jul row whose check-out is five days
after its check-in.

**Why the existing plausibility guard missed it — the transferable part.** The file already
refused an implausible stamp (`elapsedHours > MAX_PLAUSIBLE_SHIFT_HOURS`, 16). Elapsed here was
**0.003 hours**, entirely believable. **The fault was never an unbelievable stamp; it was
counting absence.** A guard on the *shape* of the inputs cannot catch a rule that is wrong about
*which interval it means*.

**Fix:** the window opens at the **later** of scheduled end and check-in
(`checkInAt > scheduledEnd ? checkInAt : scheduledEnd`). Invariant restored: **minutes claimed
can never exceed minutes present.** Two hours worked past a noon slot still claims two hours;
twelve seconds claims nothing.

`overtime.test.ts` — **second test file in the repo**, written RED first (3 of 7 failed; the
invariant case read *540 claimed for 480 present*). It sweeps every late check-in hour 08:00–20:00
rather than asserting one example. 7/7, 12/12 repo-wide, `tsc` 0.

**The live claim was rejected, not approved** — `PATCH /shift-assignment/:id/overtime`
`{"decision":"reject"}` on the agency owner session → `rejected` / `0.00`, pending list empty.
No money moved, and `0.00` records "decided, worth nothing" not "never decided". The endpoint
**409s on an already-decided claim, so this is one-way** — that is why it was asked first.

## 🟢 The Sun–Sat anchor is now OBSERVED — and it cost no data

The open doubt from [[voucher-duplicate-guard-overlap]] is closed **without writing a test row**.
`GET /shift-assignment/overtime/pending` returns `week` straight from `weekOfDate`
**as the running process computes it** (`shift-assignment.controller.ts` ~:738). Shift date
**Monday `2026-08-03`** → **`2026-08-02 .. 2026-08-08`**, verified with `getUTCDay()` rather than
eyeballed.

**The technique, worth reaching for first:** the plan was to self-log a line and inspect the week
— a write, a cleanup, and a PR login. **Before staging a write to verify a derived value, check
whether some read endpoint already returns that value.** One `curl` replaced the whole exercise
and left the DB untouched. Belongs beside [[prove-guards-live-without-writing]].

## Both writes RAN 4 Aug (evening) — `c0b732f`. One succeeded; one was refused by the DB.

**`due_date` backfilled, 4 of 5.** New `scripts/backfill-voucher-due-dates.ts` — report-only by
default, `--apply` to write. `PV-000002 → 08-01`, `PV-000003`/`PV-000004 → 08-08`,
`PV-000006 → 08-15`. **`PV-000005` skipped on purpose** (still Monday-anchored, so `week_end + 7`
would land seven days after the *wrong* week end); it stays the only NULL. Re-running reports
nothing eligible — that is the verification.

**🔴 The re-anchor was REFUSED by `payment_voucher_one_per_pr_week`. Nothing was written — and the
refusal was the finding.** `Key (pr_id, week_start)=(d48f38ad…, 2026-08-02) already exists`:
`PV-000005` and `PV-000006` are the **same PR (Victoria Tan Mei Lin) and the same Sun–Sat week**.

**They are NOT a double bill** — they are **one week split across two rows**:
`PV-000005` holds `08-03` **wages RM700.00** (assignment `6574b2ee`); `PV-000006` holds `08-04`
**drink_commission RM7.20** + receipt `RCP-000008`. Both dates sit inside `08-02..08-08`, so the
right end state is **ONE voucher of RM707.20**. This also explains `PV-000006`'s audit flag
`completed_shift_without_wages`: **the wages are on its twin, not missing.**

✅ **MERGED 4 Aug (night), `b536233` — owner's call, done.** `scripts/merge-voucher-into.ts
--from PV-000005 --into PV-000006 --apply`: report-only by default, all writes in **one
transaction**. `PV-000006` is now **RM707.20**, 2 lines, 1 receipt; `PV-000005` deleted.
`audit-live-vouchers` reports **4 of 4 reconcile** and `PV-000006`'s
`completed_shift_without_wages` flag is **gone** — the wages were never missing, they were on the
twin. Every voucher now has a due date.

The script's guards are the reusable part: same PR, same agency, both still editable
(`pending_review`/`draft` — **a `sent`/`signed`/`paid` voucher is a record, not a draft**), and
every moved line already inside the destination's week. **Totals are recomputed from the LINES,
never by adding the two stored nets** — so a wrong stored subtotal cannot survive a merge. The
`delete` runs **last inside the transaction**, so any child row left behind trips its FK and rolls
everything back.

**Script gap:** it asserts every line still falls inside the NEW week but **never checks whether the
destination `(pr_id, week_start)` is already occupied** — which is why it planned an impossible move.
A guard that protects the *contents* of a row can still plan a move the row's *identity* forbids.

⚠️ **NOT verified: whether the running dev backend reloaded the overtime fix.** The test proves
the source; `tsx watch` should have taken it, but that assumption is exactly what produced the
phantom anchor bug — see [[confirm-before-asserting]] and [[green-signals-that-lie]]. Confirm at
the next real check-out, or restart the backend.
