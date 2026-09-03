---
name: dedupe-survivor-became-an-address
description: "🟢 FIXED 3 Sep 2026 — a venue named Vicky on a job posted to 2 agencies and only 1 saw the ask. The per-membership design was right; a DISTINCT ON added to fix a display bug left one arbitrary membership standing, and the client used that survivor as the request's ADDRESS"
metadata: 
  node_type: memory
  type: project
  originSessionId: 43ebb7f3-0546-494a-95b9-c395302d2c7b
  modified: 2026-09-03T03:07:28.862Z
---

Emhub posted a shift to **Atlas AND Why We Met**, named Vicky (on both rosters), and only
Why We Met saw the request. Nothing was broken in the feature's own design.

## The storage was already right

`shift_pr_request` stores **(shift, person, agency)** and each agency reads only rows addressed
to it (`eq(ShiftPrRequestTable.agencyId, agencyId)`). The table has no unique constraint
blocking a second agency, so it could always have held both rows. **Only one was ever written.**

## The fault: a dedupe's leftover row became an address

`listPaginated` (`pr.repository.ts`) runs, for an outlet caller,
`selectDistinctOn([userId]) … orderBy(userId, desc(createdAt))`. That was added deliberately and
correctly — Alice appeared twice with two different tiers — and its own comment even says *"at
Post Job time no agency has been chosen yet, so no single membership's tier is the right answer
anyway."* True. It then **keeps one membership anyway**, and the Post Job card carried that one
`agencyId` into `requestedPrs`, so the survivor silently became **who the request was sent to**.

⚠️ **The winner is the newest membership WITHIN the ticked agencies**, not overall. Vicky's
newest is Delta (18 Aug), but Delta was not ticked, so Why We Met (12 Aug) beat Atlas (20 Jul).
Predicting "newest membership" without accounting for the pool's own agency filter gives the
wrong answer and would have sent the diagnosis chasing the wrong query.

**The lesson**: a dedupe answers *"which row do I DISPLAY?"* Downstream code then read it as
*"which row is the TRUTH?"* Whenever a query collapses N rows to 1, check what the survivor is
later used to *decide* — a display pick is not an identity. Same family as
[[oldest-membership-was-the-agency]] (read filtered by agency, write resolved by age) and
[[outlet-read-a-foreign-agencys-tier]].

## The fix

Pairs are **re-resolved server-side** from the roster (`listMembershipPairs`, excluding
`rejected` to match the picker's own pool); the client's `agencyId` is now advisory. The
**invited set is the only source of agencies**, so both halves of the owner's rule fall out of
one expression: every posted-to agency holding her gets a row, and an agency the venue did not
post to never does. Outlet-side views regroup to one row per person (`lib/requested-prs.ts`) —
the venue reads ALL rows and would otherwise see the same face once per agency; agency views
needed no change.

## Proving it without writing to the shared DB

`_probe-request-pr-cross-agency.ts` fires the real resolver at the real roster. **Section 4
carries a CONTROL row**: Delta absent proves nothing on its own — Delta might be excluded for
some incidental reason — so the probe also invites Delta and asserts it *appears*. See
[[prove-guards-live-without-writing]] and [[absent-evidence-is-about-the-instrument]].

Diagnosis-grade evidence came from counting: `invited=2, request_rows=1` on both of the
coworker's posts. **Only 4 of 52 PRs hold multiple memberships**, which is why this survived
since the feature shipped.

⚠️ Still open: rows written before the fix keep their single agency (4 shifts), and
`requestedPrs` is **create-only** — editing a posted shift can neither add nor repair one.
