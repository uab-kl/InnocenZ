---
name: ai-suggestion-auto-assign
description: "Agency home \"AI suggestion\" card rebuilt as a real backend auto-assign (preview→confirm); scope is a one-line switch from today to the whole week; live agency-session check still outstanding"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3da299aa-76f5-44ce-8858-bcf85ae19ee2
  modified: 2026-07-27T07:02:22.787Z
---

The agency home "AI suggestion" card used to read the **demo Zustand store** and,
when that store was empty (i.e. any real login), fell through to a hardcoded
`Reassign 2 PRs to Onyx KL` / `Boost incentive at Pearl Lounge` branch — outlets
that do not exist in the backend. Replaced 2026-07-27 with a real planner:

- `agency-portal/lib/auto-assign.ts` — pure `buildAutoAssignPlan`. Open slots =
  shift `quantity` minus staffing assignments (mirrors the backend's
  `NON_STAFFING_STATUSES` = cancelled/no_show/leave_approved); only `open` +
  `confirmed` shifts are staffable; candidates are active PRs not already
  working that date, ranked **tier (tier_1 best) → fewest shifts this payroll
  week → name**. Distance/rating ranking is impossible: the backend `pr` row has
  only name/nickname/tier/status (no rating, no home location).
  **No outlet is prioritised** — slots are filled one at a time rotating across
  outlets (turn goes to whoever has been given the fewest PRs so far), so a
  short night thins every outlet equally. The first cut sorted open shifts by
  outlet NAME, which quietly starved alphabetically-later outlets; the user
  rejected that. Outlet name now only breaks a dead tie.
- `agency-portal/hooks/use-auto-assign-plan.ts` — loads the Sun–Sat payroll week
  (always the full week, because the fairness tie-break counts it) and reuses the
  `["roster", …]` query keys so the roster screen shares one cache.
- Card → `IzSheet` preview with per-row Skip → Confirm writes one
  `POST /shift-assignment` per pair, collecting failures instead of aborting.

**Scope switch:** `useAutoAssignPlan("today")` in `AiSuggestionsPanel.tsx` —
pass `"week"` to plan the whole payroll week; `targetDates` is the only thing
that changes. The user asked for today now, week later.

**Verified against the real DB** (innocenz-test) 2026-07-27 by running the actual
planner over rows pulled straight from `main.shift` / `main.shift_assignment` /
`main.pr`: Atlas Agency, 27 Jul → 2 confirmed shifts (Emhub Testing qty 6,
Velvet 23 qty 6) = 11 open slots, 3 free PRs (Haziq/Nurul/Sofia); Vicky
correctly excluded because she is already `assigned` at Velvet 23 that night.
Rotation gave Emhub 2 / Velvet 1, not 3/0. Delta + Starline have no shifts this
week, so their card reads "No open shifts today" — correct, not a bug.

**UI click-through DONE** in a real Atlas Agency session: card read "Assign
available PR · 3 PRs ready for 11 open slots today", sheet listed the 3 real
pairings with the DB's own event labels ("Testing Shift", "Friday lounge"),
Skip/Include correctly re-counted the Confirm button, no console errors.
**Confirm was never pressed — no assignment rows written.** Note the in-app
Browser pane has its own localStorage: an outlet login there does NOT make the
agency card go live, `iz-agency-identity` must be present.

**Confirm re-validates before writing** (`validateAutoAssignPairs`): the plan is
built from 30s-cached queries and `POST /shift-assignment`
(shift-assignment.controller.ts ~line 564) checks ONLY agency ownership + that
the PR belongs to the shift's agency — it does NOT enforce `quantity`, reject a
duplicate PR on a shift, or block a same-night double-booking. Without the
re-check a stale plan would silently overstaff. Stale pairs are dropped with a
reason (shift-gone / shift-full / pr-busy), never written. A real backend guard
is still missing and deserves its own task (affects roster + mobile too).

Committed as **b68372f** on branch SL, 2026-07-27.

Related: [[roster-backend-wiring]] (listed auto-assign as deferred — this
supersedes that), [[outlet-post-job-today-calendar]] (posts must be `confirmed`
to be staffable), [[backend-port-7777]].
