---
name: innocenz-day-status-lifecycle
description: "InnocenZ PR day-status sequence — PENDING on check-out, APPROVED on agency approval (which unlocks Dispute), VERIFIED only after the agency resolves the dispute"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2518481e-d8d4-4ce6-87bc-8a3e7c965b3a
  modified: 2026-08-05T02:27:57.858Z
---

Owner's canonical sequence, stated 5 Aug 2026 — the order the PR's Payment page must follow:

1. **PENDING** — the PR checks out and the day's money is sealed. Nobody has checked it.
2. **APPROVED** — the agency approves that day. Only now does the **Dispute button appear**; before
   this there is no stated figure to argue with, only the PR's own claim.
3. *(DISPUTED)* — the PR raises a claim. It outranks APPROVED while open: the approval is the very
   thing being contested.
4. **VERIFIED** — the agency RESOLVES the dispute. Verified is stronger than approved: the figure was
   questioned and answered, not merely signed off.

**Do not shortcut step 2.** Approval is the precondition for the dispute, and only drinks and tips are
disputable at all — see [[innocenz-dispute-rule]]. Wages and OT never reach a dispute; they are
outlet-fixed.

**Open point, not yet decided by the owner:** a day nobody ever disputes. The Sunday 02:00 rollover
verifies undisputed approved receipts today (see `docs/claude-memory/innocenz-receipt-lifecycle.md`),
which is what stops a week hanging at APPROVED forever. That is assumed to stay — but the sequence
above describes VERIFIED as the post-dispute state, so confirm before changing either.

Implementation: `prVisibleDayStatuses` (backend — what the phone is told) and `dayStatusLabel` /
`disputesForDay` / `openDisputeKeys` in `apps/mobile/src/lib/receipt-review.ts`. A STALE day — total
changed after approval — drops back to PENDING rather than claiming an approval of a figure that no
longer exists.

Related: [[innocenz-dispute-rule]] · [[innocenz-confirm-every-action]] · [[innocenz-pv-pipeline]]
