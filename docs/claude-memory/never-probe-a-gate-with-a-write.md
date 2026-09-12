---
name: never-probe-a-gate-with-a-write
description: "A permission must be probed with a READ, or a call that CANNOT succeed — an 'invalid-looking' body is not an invalid one. Cost two venues' rate cards on 12 Sep 2026, and a venue rename in August."
metadata: 
  node_type: memory
  type: feedback
  modified: 2026-09-12T00:00:00.000Z
---

**To find out whether a lane may do something, ask with a GET — or with a call that
cannot possibly succeed (an id that does not exist). NEVER with a body the handler
might accept.**

"Invalid-looking" is not the same as invalid. Three incidents, all the same error:

1. **August 2026** — probed whether a Director could write by sending a real
   `PUT /outlet/:id` with `{"name":"probe-should-not-apply"}`. On the owner it
   succeeded and renamed a live venue ("Velvet 23"); restored immediately.
2. **12 Sep 2026** — probed the Workspace guard with
   `PUT /outlet-workspace/:outletId` and `{"__probe":"invalid on purpose"}`. That
   handler treats **every field as optional** and performs a FULL-DRAFT save, so the
   body was accepted as "save a workspace with nothing in it": **UAB Emhub and
   Velvet 23 each had every scalar zeroed and all 7 `outlet_tier_rate` rows
   deleted.** Repaired from `default-rate-card.ts` (which *is* Emhub's numbers, so
   Emhub came back exact); **Velvet 23's own values were unrecoverable** — its row
   predated the 10 Sep standardisation and the audit row stored `old_data: null`.
3. **12 Sep 2026, the same hour** — probed the receipt lanes with a POST to
   `/payment-voucher/receipts/approve-all`. It returned **200**: it ran. A no-op only
   because the invalid body named no payroll week. Luck, not design.

**Why the trap keeps working:** a full-draft save endpoint accepts unknown keys and
reads missing ones as "clear it". You expected a 400, the response says 200, and
nothing warns you. **A 200 from a write probe is the signal to go and check the table
immediately.**

**Why the audit log will not save you:** `old_data` was `null` on the destroying
write, so the previous values could not be recovered from it. It is not a backup.

**How to apply:**
- Prefer a READ that requires the same permission.
- If a write must be exercised, aim it at an id that cannot exist, so the gate
  answers and the handler 400s after it.
- After ANY write probe, assert row count and `updated_at` are unchanged *inside the
  probe* — `_probe-partnership-guard.ts` and `_probe-shift-template-lane.ts` both do
  this and print "0 rows written".
- A probe that genuinely must write goes behind an explicit flag with the incident in
  its header — see `_probe-workspace-lane.ts`, which now refuses without
  `--i-know-this-writes`.

Related: [[absent-evidence-is-about-the-instrument]], [[confirm-before-asserting]],
[[write-never-landed-check-first]], [[innocenz-database-rules]].
