---
name: innocenz-confirm-every-action
description: InnocenZ UI rule — every agency approve/edit/save must show a visible success message naming what happened; silence reads as failure
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2518481e-d8d4-4ce6-87bc-8a3e7c965b3a
  modified: 2026-08-05T01:57:34.077Z
---

Owner's standing rule, 5 Aug 2026: *"always remember if the agency click approve or edit, need show
the successful message to let the agency know that the action"*.

**Why:** these screens move money. An approve that silently repaints, or an edit whose figure looks
unchanged for the length of a round trip, reads as "it didn't work" — so the reviewer clicks again.
On the receipt and day paths a second click is not harmless: it re-approves, re-stales a day, or
fires a duplicate write. The confirmation is what stops the double-click, not just politeness.

**How to apply:**
- Prefer the SERVER's own sentence verbatim — it already names the consequence ("Line corrected —
  approve the receipt again to confirm the new figure", "2 day(s) approved · 3 receipt(s) approved
  with them"). Do not flatten it into "Saved".
- A write that never reached the server must still say something — see `writeFailureMessage` in
  `apps/web/src/agency-portal/hooks/`, which exists because a null `response.data.message` used to
  render nothing at all.
- Applies to: day Approve/Hold/Clear, receipt Approve/Withdraw, every save in the receipt editor,
  the voucher Send, and To-pay. Check each new agency action against this before calling it done.

Related: [[innocenz-dispute-rule]] · the receipt lifecycle at
`docs/claude-memory/innocenz-receipt-lifecycle.md`
