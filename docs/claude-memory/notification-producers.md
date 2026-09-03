---
name: notification-producers
description: "All 6 notification kinds now have producers — who fires each, who receives it, and the non-obvious triggers (OT = the check-out clamp; join decision = pr.status)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c5ccb3a-1b60-4b89-b695-e6bf764672ea
  modified: 2026-07-29T07:08:45.222Z
---

Completed 29 Jul 2026 (`009dc46`, `c55607d`, `dfec4f5`). `notify()` / the `notification` table
shipped in Phase C (`72fc61f`) but only TWO producers existed, so 4 of the 6 declared kinds never
fired. All six now do.

## The map

| kind | producer | recipient |
|---|---|---|
| `payment_voucher_issued` | weekly payout job | PR |
| `payment_voucher_dispute_resolved` | `payment-voucher.controller` resolveDispute | PR |
| `shift_assigned` | `shift-assignment.controller` **create** | PR |
| `shift_cancelled` | same controller **update** (transition INTO cancelled) + **remove** | PR |
| `overtime_pending_approval` | same controller **checkOutMine** | **AGENCY members** |
| `agency_join_resolved` | **`pr.controller` update** | PR |

## The two non-obvious triggers

**Overtime fires off the CLAMP.** `checkOutMine` already clamps the stamp to the shift's scheduled
end so a late check-out cannot inflate pay. `scheduledEnd && now > scheduledEnd` therefore *is*
the "there is overtime pending approval" condition — no separate OT field is consulted. Recipient
is the agency (via `agencyMemberRepository.listByAgency` → `notifyMany`), not the PR, because it
is the agency's decision. **Typechecked but never live-fired** — staging it needs a checked-in
assignment past its scheduled end.

**A join decision IS a `pr.status` transition.** There is **no approve endpoint for `agency_pr`** —
that repository has no `approveStatus` writer at all. The Approvals screen decides a sign-up by
writing `pr.status`: `active` = accepted, `inactive` = declined. Do not go looking for a
join-approval route; there isn't one.

⚠️ `pr_status` has **FOUR** values — `active | inactive | pending | suspended`. The first cut
treated "not active" as a rejection, which would have told a *suspended* PR their application was
declined. Only `active`/`inactive` count as decisions now (`dfec4f5`); the other two stay silent
because no kind describes them. Guarded on the status actually changing, so profile edits are
silent.

## `pr.reject_reason` — why a declined PR was told nothing (`d907849`)

The Approvals sheet always collected a rejection reason and threw it away: `backend.reject(id)`
ignored the argument and no column existed, so the decline notification had nothing to quote.
**Migration 0065** adds `main.pr.reject_reason varchar(500)`, nullable, `IF NOT EXISTS` (shared DB,
jk migrates it too). Applied — live max `when` is now **1785299538616**, so jk's next migration
must exceed that.

The reason rides on `PUT /pr/:id` beside `status:'inactive'`, and **the controller CLEARS it
whenever a PR is set `active`** — one writer's job, not every caller's, so re-accepting someone
previously declined cannot leave a stale reason on an active roster member. Verified: reject →
column holds the text and the notification body quotes it; accept → column back to `null`.

## Verified live

Dispute resolve, join accept and join decline, plus assign/unassign, all wrote correct rows against
the running backend; every test row was deleted afterwards, so the table is back to 0.

**Still in-app only.** No mailer, no WhatsApp sender — a row here IS the whole delivery, and the
mobile app has to read the table for a PR to ever see it. See [[app-foundation-gaps]].
