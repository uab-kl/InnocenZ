---
name: innocenz-shift-day-rule
description: "A shift belongs to the day its START time falls on — an overnight shift is filed under the day it began, never the day it ends"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c58b9c76-54bb-47e1-924e-395263a256a1
  modified: 2026-08-27T13:42:31.961Z
---

Owner's ruling, 27 Aug 2026, verbatim: **"if that day must for start shift time
is considered that day"**.

A shift belongs to the day its **start time** falls on. A 22:00–04:00 shift
posted for the 30th is a **30th** shift, even though four of its hours are spent
on the 31st. The start time decides the filing; the end time never does.

**Why:** overnight is the normal shape in this business, so "which day was that"
would otherwise have two answers for most shifts on the book — and a PR, an
agency and a venue would each pick a different one when counting a night's work.

**How to apply:** this is already how the backend behaves, and the ruling
confirms it rather than changing it — `slotMinutes` adds 24h to an end that is
`<= start`, and `shiftWindow` anchors the pair to `dayIndex(shiftDate) * 1440`,
so a shift starts on its `shift_date` and simply runs past midnight. Anything
that files a shift under its END day, or that reads a slot's end as a smaller
number than its start, is wrong.

⚠️ **This is about FILING, not about collision.** Two shifts on different dates
can still clash in real time: the 30th's 22:00–04:00 genuinely overlaps the
31st's 02:00–06:00 from 02:00 to 04:00, and one person cannot work both. The
server gets that right via its continuous timeline; the roster grid's
client-side copy compares minutes-within-a-day and misses it (recorded as N16,
still open — it UNDER-warns, so the server still refuses the booking).

Related: [[innocenz-status-colour-code]] for the live duty states, which turn on
STAMPS rather than on the clock, and [[innocenz-cross-agency-busy-rule]] for what
a rival agency may see of a busy window.
