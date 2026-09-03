---
name: voucher-duplicate-guard-overlap
description: "A PR was billed twice for one shift; the guard now matches week OVERLAP not week_start equality — and the 'anchor bug' was a stale backend process, not code"
metadata: 
  node_type: memory
  type: project
  originSessionId: 779ace3d-7868-4560-9546-13e3b2f1dc5c
  modified: 2026-08-04T01:34:43.442Z
---

**4 Aug 2026. HEAD `2efbb67` on `SL`, 2 commits unpushed, tree clean.**

**A PR held TWO vouchers for one shift.** `PV-000005` (PR self-log, Mon-anchored
`2026-08-03..09`) and `PV-000006` (generator, Sun-anchored `2026-08-02..08`) each carried a
RM700 wages line whose `ref` named the **same assignment `6574b2ee`** — RM1,400 for twelve
seconds of attendance. `PV-000006` deleted; `PV-000005` survives as the sole record.

**FIXED (`2efbb67`):** `existsForPrWeek()` matched `week_start` for **equality**, so
`'2026-08-02'` vs `'2026-08-03'` read as different weeks. Now matches on **OVERLAP**
(`week_start <= newEnd AND week_end >= newStart`), with the exact-`week_start` arm KEPT — a
legacy row with NULL `week_end` cannot satisfy a range test, and dropping it would make the new
guard weaker than the old one for those rows. Optional 4th arg `weekEnd` defaults to
`weekStart` (the create endpoint's week fields are optional), degrading to a day-inside-week
check. **Regression-proven live: the same `generateForWeek` call that minted `PV-000006` now
returns `0 created, 1 skipped (already_exists)`.**

⚠️ **The "Mon–Sun anchor bug" DOES NOT EXIST IN THE CODE — do not fix it.** All three helpers
are Sunday-anchored (`previousCompleteWeek`, `weekOfDate`, `weekBounds`), the cron is
`0 2 * * 0`, and the PR app sends no week (`PrReceiptLineInput` has no `weekStart`).
`PV-000005` was written by a **stale backend process running pre-merge Monday-anchored code** —
the `tsx watch` trap. I drafted a Sunday-anchor "fix" and discarded it. See
[[green-signals-that-lie]] and [[confirm-before-asserting]].

**Also shipped `2662c94`: `due_date` now computed at generation.** `paymentDueDate(weekEnd,
termDays = 7)` in `payment-voucher-week.ts`, anchored to **`week_end` not `issued_date`**
(owner's call) so a late or repeated run cannot give one week two due dates. Malformed input
returns null. Both entry points get it — the Sunday cron and `scripts/generate-weekly-pvs.ts`.
**First test in the repo**: `payment-voucher-week.test.ts`, 5/5. Backend `tsc` baseline is now
**0 errors / 245 files**, not the 26 recorded in [[biome-scope-and-mobile-style]].

**OPEN, in order:**
1. **Live-verify the anchor** — one fresh self-logged line should produce Sun–Sat. The fix is
   inferred from code + a clean restart, **not observed**; dev servers were down.
2. **Re-anchor `PV-000005`** `08-03..09` → `08-02..08` (`scripts/reanchor-voucher-weeks.ts`).
3. **Backfill `due_date`** — BLOCKED, the bulk UPDATE on `payment_voucher` was refused by the
   permission classifier. Run by hand:
   `update main.payment_voucher set due_date = week_end + 7 where due_date is null and extract(dow from week_start) = 0;`
   (skips `PV-000005`, whose week is wrong).
4. **🔴 Unbounded overtime** — 12 seconds between check-in and check-out produced
   `overtime_minutes = 279` (~RM813, status `pending`). Measured from the shift's scheduled end
   to the check-out clock, never consulting check-in. Explains the live "113.1h" line and the
   23 Jul assignment whose check-out is 5 days after its check-in. **Highest money risk left.**

Full detail in `TEST_SCRIPT.md` §9 (the 4 Aug START HERE block) and §10.
