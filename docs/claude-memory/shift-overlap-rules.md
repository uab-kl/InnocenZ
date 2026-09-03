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

**Live-verified:** overnight pair refused 400 (naming the other shift + venue), a clear next-day
window accepted, a second same-day shift accepted, test shift restored.

**Also:** editing this file family via PowerShell `Get-Content -Raw` + `WriteAllText(UTF8)` corrupted
30 em dashes in `shift-assignment.controller.ts` (ANSI read, UTF-8 write). Use the Edit tool on
source files; see [[live-role-sweep-30jul]] for the other PowerShell traps.
