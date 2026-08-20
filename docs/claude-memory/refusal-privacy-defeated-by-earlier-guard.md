---
name: refusal-privacy-defeated-by-earlier-guard
description: "A refusal worded to hide a rival agency leaked it anyway, because an EARLIER guard refused first with a chattier message; plus agencies[0] labelling a merged multi-agency feed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 78096242-e372-405f-899d-ee641f77fe03
  modified: 2026-08-20T10:13:49.883Z
---

Fixed 20 Aug 2026 on branch `SL`, for a PR who is on **two agencies' rosters at once**.

> ⚠️ **THE DAY-GUARD DESCRIBED BELOW NO LONGER EXISTS** (owner's change, later the same
> day). "THE DAY BELONGS TO THE PR" was narrowed to **the shift's own window + the travel
> time between the two venues**; everything outside that is bookable by any agency. The
> privacy LESSON below is unchanged and is the reason this memory exists — but the guard it
> is told through was replaced by `foreignTravelBlock`, and the anonymous wording is now the
> shared constant `PR_UNAVAILABLE_THEN` rather than the self-declared-block sentence. See
> the closing section for the new shape.

## Live shape — this is not hypothetical

`agency_pr` held **59 memberships over 52 people**, so **4 PRs are in 2+ agencies**.
**Alice Yee Mei Me** (`1cfade6c-…`) is approved at **all four** agencies and actually booked
by two — 12 Atlas + 1 Why We Met — and is graded **tier_2 at Atlas but tier_1 at the other
three**. She is the standing test case for anything cross-agency: a split tier plus a real
shared shift (18 Aug 15:00–04:00 at JK House is an **Atlas-owned shift staffed by WWM** —
`shift.agency_id` and `shift_assignment.agency_id` genuinely differ, via `shift_agency`).

Agency logins: `owner@atlas-agency.my` / `whywemet@agency.com`, both `Password123!`.
Alice: `pr.alice@innocenz.demo` / `password`.

## THE RULE — a privacy-designed refusal is only as private as the guard that runs BEFORE it

The "THE DAY BELONGS TO THE PR" day-guard was written with real care: its refusal reuses the
**self-declared-block wording word for word** so agency B cannot tell "she took the day off"
from "she is booked by someone else", because a distinguishable message turns the assign
endpoint into a probe for reading a rival's roster one PR at a time.

All of that bought **nothing**, because the *overlap* guard sat **thirty lines earlier** in the
same function, carried no `agencyId` term, and answered:

> `This PR already works 15:00 - 04:00 at JK House that day`

— handing agency B the identity of agency A's client and the hours it trades.

**Generalise it: when you harden one refusal for privacy, walk every earlier `return res.status(4xx)`
in the same handler.** The careful message is the LAST thing a caller sees, not the first.
Grep the whole handler for refusals, not just the one you are writing.

The fix keeps the **guard** cross-agency — a person is in one place at one time, whoever booked
them — and narrows only the **explanation**: own-agency clash still names slot + venue (that is
the agency's own fact, and it is what makes the refusal actionable), a foreign one falls back to
the day-guard's exact wording. `dayKey` was hoisted above both so the two strings cannot drift.

⚠️ **Do not "simplify" this by deleting the overlap guard and leaving it to the day-guard.**
Overnight is why: WWM's 18 Aug `15:00 - 04:00` overlaps a hypothetical 19 Aug `02:00 - 06:00`
while the two rows carry **different `shiftDate`s**, so the day-key equality test never sees it.
Verified: `shiftsOverlap('2026-08-19','02:00 - 06:00','2026-08-18','15:00 - 04:00') === true`.

## The second bug — first-of-array on a MERGED feed

`listMineAssignments` (the PR phone's `/mine`) never joined `agency`, so no row said who booked
it. `AgencySchedulePanel` therefore did `agencies[0]?.agencyName`, computed **once** and stamped
onto every card in the map. That feed **merges every agency's bookings into one schedule**, so
one arbitrary membership named all of them — and for Alice, two of her four memberships have
booked her zero shifts, so the label could name an agency with nothing on the screen.

**First-of-array is a coin toss unless the array has exactly one element.** It now survives only
behind `agencies.length === 1`, where first-of-one is genuinely the answer. Same family as
[[oldest-membership-was-the-agency]] and the id-keyed Map in [[outlet-read-a-foreign-agencys-tier]]:
*an agency is a fact about the ASSIGNMENT, never about the person.*

## A third suspicion was DISPROVED — do not "fix" it

The web auto-assign planner looks agency-blind (`busyDatesByPr` is built from agency-scoped
assignments). It is **fine**: `GET /pr-availability` → `listForAgency` already merges
`listCommittedElsewhere` into the same list as *deliberately indistinguishable* derived blocks,
and `use-auto-assign-plan.ts` consumes exactly that endpoint and folds it in. Do not add a
second cross-agency source — see [[preview-and-action-must-share-a-window]] for why the merge
was built, and read that merge's comments before touching it: five of its fields were once
`null`, and `row.createdAt === null` was a perfect probe for "is this a rival's booking?".

## What was already correct (leave it alone)

The assign path is hardened for multi-agency and its comments name Alice: tier resolves via
`getByUserId(userId, actingAgencyId)`; membership is tested on `agency_pr` filtered to the acting
agency; the tier-mix seat count joins on **(user_id, agency_id)** — joining on `user_id` alone
counted one PR as several ("3/2 Tier I"); `syncLinksForUser` **retains** approved memberships so a
profile save cannot wipe the other agency; PVs are per-agency.

## THE RULE AS IT STANDS NOW (20 Aug 2026, later the same day)

Cross-agency, a PR is unbookable for **their other shift's window plus the trip to it**, and
for nothing else. Two guards, both in `create` AND — since the audit — in the re-staffing
`PUT /shift-assignment/:id` lane:

1. the existing cross-agency **overlap** test (continuous timeline, survives overnight);
2. **`foreignTravelBlock`** (travel-gap.ts) — a shortfall against a neighbour held by a
   DIFFERENT agency. Measured on real pins: JK House → Velvet 23 is 45 min, and the boundary
   lands exactly there (45 min gap allowed, 30 min refused). 5 of 10 probed slots the day
   rule refused are now bookable.

⚠️ **The asymmetry is the design, not an oversight.** A tight turnaround against the agency's
OWN booking stays an overridable WARNING (17 Aug rule — it can see both venues and may know
they share a car park). Against a FOREIGN booking it is a REFUSAL: that agency cannot see the
other shift at all, so it has nothing to exercise judgement with, and an "override" there is a
guess that ends with a PR who cannot arrive.

⚠️ **`PR_UNAVAILABLE_THEN` is ONE string for both the overlap and the travel refusal, on
purpose.** Two messages would separate "working at that exact hour" from "working near that
hour, far away", and the second leaks DISTANCE — walk the candidate time backwards until the
refusal changes and you have read off roughly how far the rival venue is.

⚠️ **Two bypasses closed at the same time, both found by the multi-agency audit:**
`travelGapWarning` was rendering *"this PR also works 15:00 - 04:00 at JK House"* about a
RIVAL's booking (foreign neighbours are now dropped, not described); and the re-staffing PUT
lane enforced NONE of the presence guards, so **book → cancel → un-cancel** was a one-request
way to double-book a person across two agencies.

`listCommittedElsewhere`'s derived day-blocks are UNWIRED from `GET /pr-availability` (they
would grey exactly the days the new rule frees) but the query is deliberately KEPT — previewing
the WINDOWS is the real repair. Known cost, stated out loud: the planner can now propose a time
the guard refuses.

## How to prove it again in two minutes

A refusal writes nothing, so fire both freely ([[prove-guards-live-without-writing]]):
Atlas → Alice on its own 18 Aug 22:00–04:00 shift gets the **neutral** wording; WWM → Alice on
its own 18 Aug 22:00–04:00 shift gets the **venue-naming** wording. Alice's assignment count must
still read 13 afterwards. `apps/backend/src/scripts/_probe-multi-agency-pr.ts` (untracked) prints
the whole multi-agency picture; `_probe-alice.ts` proves the `/mine` agency join.
