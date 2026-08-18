---
name: zero-count-tier-is-a-price
description: A pay-tier row asking for 0 PRs is a PRICE, not a quota — and the write side used to throw it away entirely
metadata:
  type: project
---

Post Job lets a venue set a tier's rates while requesting **none** of that tier. Two faults, and
fixing only one makes things worse (18 Aug 2026, owner-verified on screen):

1. `shiftPayTiersFromRows` filtered `prCount > 0` before writing, so that rate never reached
   `shift_pay_tier`. The panel later drew the WORKSPACE rate and nothing said the typed number had
   gone. **A composer that lets you type a value it discards is a trap, not a rule.**
2. Persisting the row alone would have been worse. `seatFor` / `shiftBlockedFor` treat merely
   **HAVING the bucket key** as "this tier was named", so a stored row wanting 0 gives
   `have >= want` = `0 >= 0` — tier full before anyone is on it, and **no PR of that tier could
   ever be assigned**. A dropped rate traded for an unstaffable tier.

**Why:** demand and price rode in the same row, so a filter meant for one silently governed the
other. The general shape: *a count of zero and an absence are not the same fact, and a Map keyed by
bucket cannot tell them apart.*

**How to apply:** every composer row is persisted; `askedByBucket` — the ONE place the seat guard,
`remainingByBucket` and `totalDemand` all read demand through, mirrored in `auto-assign.ts` — skips
`prCount <= 0`. Never restore the write-side filter without revisiting that skip. Shifts posted
before 18 Aug carry no zero rows; re-saving one in Post Job backfills it, no migration.
Related: [[workspace-tier-rate-daily-wage]], [[outlet-panel-reads-demo-slices]].
