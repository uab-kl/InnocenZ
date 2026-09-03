---
name: client-guard-stricter-than-server
description: "A client-side filter STRICTER than the server's refuses work the API would accept — and agency-scoped reads make it asymmetric, so the same person is offered at one agency and invisible at the other; found 3 Sep 2026 in auto-assign, whose busy rule was a DAY while the server's was a WINDOW"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f24310ff-81da-4579-ba7e-e20ebd2c3679
  modified: 2026-09-03T05:40:08.180Z
---

**3 Sep 2026.** A venue named Vicky for a 16:00–20:00 shift posted to **two** agencies. Atlas's
auto-assign sheet would not offer her. Why We Met's offered her normally. Same person, same shift.

## The shape of the bug

`buildAutoAssignPlan` dropped any PR holding **any** assignment on the target **date**. The server
had given up its own calendar-day rule in Aug 2026 and refuses only a genuine **window overlap**
(`shiftsOverlap`), exempting `completed` and checked-out rows. So the client was **stricter than the
API** — refusing pairings `POST /shift-assignment` would have accepted.

Two things made it nearly invisible:

1. **`GET /shift-assignment` is agency-scoped.** Vicky's two earlier bookings that day belonged to
   Atlas, so only Atlas could see them and only Atlas hid her. The asymmetry is what got it
   reported — a symmetric version of this bug would just look like "the planner is careful".
2. **The venue's named ask could never win.** `isRequested` is a **RANKING** term applied to
   whoever survives the filter. A filter upstream of a ranking silently deletes the thing the
   ranking exists to honour.

## How to apply

- **When a client refuses something, check what the SERVER would do.** The module's whole discipline
  was "never propose what the API refuses"; nobody had checked the converse. Both directions are
  bugs, and the second one produces no error to notice — just a name that is not on a list.
- **A filter that runs BEFORE a ranking outranks every term in it.** If a rule is meant to be
  overridable ("the venue asked for this person"), it cannot sit downstream of a hard filter. Look
  for this whenever a priority rule "isn't working".
- **Scoped reads make client-side rules disagree per tenant.** Any planner deriving state from a
  list the server narrows by agency will compute a different world for each agency. That is correct
  for privacy and wrong for physics — a person can only be in one place at a time. Put the physical
  rule where it can see everything (the server) and let the client mirror it.
- **The DB settled it before any code was read.** One read-only query over `shift_pr_request`,
  `shift_agency` and `shift_assignment` showed the request rows existed for BOTH agencies (so the
  named-request fix was fine) and that only Atlas held same-day assignments. Do that first — it
  turned an open-ended "why is the UI different" into a one-file change.

Same session, same file, a second bug of the same family: `weekCountByPr` counted **every** row it
was handed under a label saying "this week" (that list has no date filter — the hook pages it to
exhaustion). Atlas printed 31 / 2 / 3 where the real week was 2 / 0 / 0, and `load()` read the same
map, so a long-serving PR sank down the fairness queue permanently. **A number that looks plausible
is not evidence** — 31 shifts reads like a busy month, and only a DB count exposed it.

See [[auto-assign-100-row-clamp]] (the other way this list lies), [[ai-suggestion-auto-assign]],
[[dedupe-survivor-became-an-address]] and [[prove-guards-live-without-writing]].
