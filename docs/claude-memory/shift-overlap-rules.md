---
name: shift-overlap-rules
description: A PR MAY work several shifts a day — only OVERLAPS are refused. Both guards now compare on a continuous timeline because the old same-date test never caught overnight-into-next-morning
metadata: 
  node_type: memory
  type: project
  originSessionId: e6a0525f-ec3a-44a2-bf33-e24471117ad8
  modified: 2026-07-30T10:38:59.220Z
---

**RULE: a PR may work as many shifts in a day as they like. The guards refuse an OVERLAP in real
time, never a second shift.** Live proof: Alice works 12:00–13:00 AND 22:00–04:00 on the same day,
both active, both accepted. Do not describe this as a "double-booking guard blocking same-day work" —
that wording caused a real misunderstanding on 30 Jul 2026.

## Two guards, one test

- **Assign** — `shift-assignment.controller.ts` `create()`: refuses assigning a PR into a clash.
- **Timing edit** — `shift.controller.ts` `update()` (`fa44ce4`): refuses dragging a shift's
  `slot`/`shiftDate` on top of another shift the same PR works. Same outcome, opposite direction,
  and silent because nobody is assigning at that moment.
- **Assignment update cannot cause a clash** — it only touches status, pay, check-in/out and notes,
  never the shift↔PR pairing. Don't add a guard there.

Both call **`shiftsOverlap(aDate, aSlot, bDate, bSlot)`** from `util/slot-window.ts`. One
implementation on purpose: two copies of "do these collide?" is how the two ends of one rule drift.

## The bug that forced the rewrite (`b73aa93`)

Both guards used to test `dayKey(a) === dayKey(b)` **before** comparing windows, so two shifts only
ever met if they shared a `shiftDate`. **An overnight shift crosses midnight**, so
`22:00–04:00 on the 30th` and `02:00–06:00 on the 31st` genuinely overlap 02:00–04:00 and were
**never compared**. Overnight is the normal shape in this business, which made it the likeliest real
collision of all. It predated the edit guard — the assign guard had it from the start.

Fix: `shiftWindow()` puts each shift on a continuous minute timeline
(`dayIndex(date) * 1440 + slotMinutes(slot)`). `slotMinutes` already wraps an overnight end past 24h,
so the wrap and the day offset compose and **the date-equality test disappears entirely** rather than
being special-cased with a ±1-day lookback.

Label-only slots ("Late night") carry no parseable window and never clash — deliberate.

## Checks that race need a lock — ONE order (30 Sep 2026)

A check that reads and a write that follows are two moments; two requests landing together both
passed (two shifts on one clock, a day past the plan, one PR booked twice). Every write that posts,
edits, moves or SEATS a PR now takes transaction advisory locks FIRST
(`features/shift/shift-write-guard.ts`), then re-runs its rules through that transaction:
**venue `shift-post:` → shift `shift-seat:` → PR `pr-booking:`**, each class once, keys lower-cased
and sorted; asking out of order throws. **How to apply:** a NEW lane that seats a PR, or moves a
shift in time or place, must take the same locks in the same order and re-check under them — a
lock taken in another order can deadlock against the existing lanes. Lanes that only take a PR
OFF a shift (cancel, leave, no-show, check-out) are deliberately unlocked. Proven live, read-only
(9/9: a second session is refused the same key and granted another venue's). Swap approval had no
overlap check at all until then.

**Never re-check under the lock with a fact read BEFORE it (1 Oct 2026).** The guard first re-ran
the plan rule against the plan the check had memoised, so a plan switched between check and lock was
enforced at its old size — two posts decided on different plans could stack a day past the new cap.
Any fact that caps a SET of writes (the plan's daily headcount) must be re-read through the
transaction after the lock (`resolveActivePlanLimit(params, tx)`). A fact about one row that no other
write's validity depends on (the venue's live status on a post) may stay memoised. No plan-lane lock
is needed: a plan switch never reads a day's shifts, and the venue lock orders every post.

**Live-verified:** overnight pair refused 400 (naming the other shift + venue), a clear next-day
window accepted, a second same-day shift accepted, test shift restored.

**Also:** editing this file family via PowerShell `Get-Content -Raw` + `WriteAllText(UTF8)` corrupted
30 em dashes in `shift-assignment.controller.ts` (ANSI read, UTF-8 write). Use the Edit tool on
source files; see [[live-role-sweep-30jul]] for the other PowerShell traps.
