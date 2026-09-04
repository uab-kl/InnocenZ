---
name: innocenz-cross-agency-busy-rule
description: "Many agencies may book one PR on the same DAY but never overlapping TIMES; busy state is shown as times only — never which agency/venue; warn, don't block"
metadata: 
  node_type: memory
  type: project
  originSessionId: c58b9c76-54bb-47e1-924e-395263a256a1
  modified: 2026-08-23T05:10:33.385Z
---

Owner's standing rule (stated 22–23 Aug 2026, three times, verbatim core): *"Can many
agency assign the same pr on the same day must different time, but the pr can view (just
agency cannot see other agency details) need show that jump out message pr on duty that
time, but cannot mention is working from which agency."*

- **Same day, many agencies: allowed.** Only **overlapping windows** are refused — the
  server's overlap guard is the authority; client surfaces WARN, never block.
- **Anonymity is absolute on rival state:** an agency (or outlet) sees a PR's busy
  window as **bare times only** (`HH:MM - HH:MM`) — never the venue, never the agency,
  never free-text that could leak them. Backend authority: `canonicalWindow()` in
  `pr-availability.repository.ts` reduces free-text slots to bare times;
  `PR_UNAVAILABLE_THEN` is deliberately ONE shared refusal string so distance/overlap
  refusals can't be told apart and probed.
- **The PR herself sees everything** — it's her own calendar.

**Why:** venues and agencies are competitors; a busy marker naming the rival is a
customer-poaching oracle. But hiding busy-ness entirely double-books real people.

**How to apply:** any new surface showing another party's schedule (badges, markers,
pickers, jump-out messages) shows state + times only. Reuse the committed-windows read;
never join outlet/agency names into rival-facing payloads. See also
[[innocenz-status-colour-code]] for how the states are coloured.
