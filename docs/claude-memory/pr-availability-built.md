---
name: pr-availability-built
description: "🟢 BUILT 13 Aug 2026 — a PR's 'not available' day was React state that died on unmount; now main.pr_availability (0121), and the assign lane 409s on it. Carries: a UI-only feature can look complete from the screen"
metadata: 
  node_type: memory
  type: project
  originSessionId: c5374656-51a7-450f-85aa-5d505e37faed
  modified: 2026-08-13T07:14:21.678Z
---

The owner asked why a day the PR marked unavailable never reached the agency. **Three
independent gaps, any one of which alone was fatal** — and the screen looked fine with all
three present, which is the lesson.

1. **Mobile never saved it.** `AgencySchedulePanel.tsx` held
   `const [blocked, setBlocked] = useState<string[]>([])`, and `toggleDay` did nothing but
   `setBlocked`. No API call, no AsyncStorage. The red cell died on unmount.
2. **The backend had no concept of availability.** 33 features, 39 models, none for it. The
   only `unavailable` in the tree was a DERIVED set in `shift-assignment.repository.ts`
   meaning "already holds an assignment that date".
3. **The agency grid had no lane to draw it.** `backend-shift-map.ts:46-55` maps the red
   **Off** cell from `shift_assignment.status ∈ {cancelled,no_show,leave_approved}`, so only
   an existing assignment row can paint a cell. A blocked day usually has no assignment.

⚠️ The **web** PR prototype DID appear to sync — `store.ts` `togglePrDayAvailability` inserts a
synthetic `AgencyRosterSlot{status:'unavailable'}` straight into the Zustand demo store that
the demo roster reads. It never touched the API. That fake made the feature look built.

## What was built

`main.pr_availability` (migration **0121**, applied + verified in `information_schema`):
`id` / `user_id` FK→`user` cascade / `unavailable_date` `date` / `reason` / 4 audit cols,
`unique(user_id, unavailable_date)`, index on `(unavailable_date, user_id)`.

**Keyed on `user_id`, NOT on `agency_pr`** — "I cannot work on the 15th" is a fact about a
person, so a PR on two rosters is unavailable to both. Per-membership storage would let the
same day disagree with itself. Agency reads scope through an INNER JOIN on `agency_pr`
(`approve_status='approved'`), because the table carries no `agency_id` to filter on.

**Row existence IS the block.** No `available` boolean to desync; reopening deletes.

Routes `/pr-availability`: `/mine` GET/POST + `DELETE /mine/:date` (token-scoped, outside the
role guard, before any `/:param`); `GET /` agency+admin only. Outlet is deliberately not a
reader.

## Where the refusal lives

Inside **`ShiftAssignmentRepository.create`'s existing `SELECT … FOR UPDATE`**, checked BEFORE
both capacity rules — so every insert path shares it and nobody can block a day in the gap
between check and insert. `PrUnavailableError` → **409** with its own wording, because the
remedy is *a different person*, not a bigger headcount or another tier.

- `seatVerdict` (the re-staffing PUT lane) returns `prUnavailable` instead of throwing.
  **`free:false` there comes WITH seats to spare**, so a caller reporting "full" from
  `staffed/quantity` is wrong — that is why it needed its own field.
- Replacement candidates fold blocked PRs into the same `unavailable` set as busy ones.
- Frontend auto-assign folds them into `busyDatesByPr` — ONE place, so its three consumers
  (free-PR count, the pick, and the `anyFreeToday` people-vs-tier test) cannot drift.
  **NOT into `weekCountByPr`**: that drives the fairness tie-break, and a blocked Saturday is
  not a worked shift — charging one would push them down the queue for days they ARE free.

⚠️ **`shift-assignment.repository.ts` imports the pr-availability MODEL, never the repository.**
That repository reaches back for `NON_STAFFING_STATUSES`, so a repo→repo edge closes an
import cycle — the failure mode that once killed the whole agency portal
([[import-cycle-killed-agency-portal]]).

## Proven live, 6/6

PR blocks a date → 201 → persists on re-read → **the agency sees it** (`Vicky · 2026-08-08`
through the agency token) → `POST /shift-assignment` for that PR that date is **409 "This PR
has marked 2026-08-08 as unavailable"** → block deleted → absence re-verified. The shared DB
was left exactly as found, and no assignment row was ever created because the assign was only
ever attempted WHILE the block was in place — see [[prove-guards-live-without-writing]].

Backend tsc **0** — the CLAUDE.md "26 pre-existing TS2883" baseline is now confirmed **stale**
(it is zero). Mobile 11 = baseline, web 110 = baseline, both untouched by this.

## The reason (second pass, same day)

Shipping the display alone would have been inert — **nothing could write a reason**: the
phone called `blockMyDay(token, iso)` with the argument omitted. So the capture was built
too: an optional reason sheet on block, while **reopening stays one tap** (taking a block
back needs no explanation, and a sheet in the way makes undoing a mistap harder than making
it). Agency cell renders it under **Unavailable**, 2-line clamp + full text on `title`.

⚠️ Carried by a **separate `blockedReasonsByPr` map**, not by widening `blockedDatesByPr` to
a nested one. Every caller that DECIDES something — the planner, the assign dialog — asks the
yes/no question, and a nested map hands them a payload they could start branching on.

Proven live 5/5, including the two that matter: **a reasonless block is still a block**
(`reason=null` — the cell has to read correctly without one) and a 201-char reason is
**refused 400, not truncated**.

## Left open

- Outlet-swap approve is deliberately NOT gated: a swap is PR-initiated consent to move a
  shift they already hold, and a day holding a shift cannot be blocked in the first place.
- **Never eyeballed in a browser or on a device.** Signing into the portal needs a password
  typed into a login form, which I do not do — so both passes are proven to the API boundary
  and the compile, never by a screenshot. ⚠️ This is a standing limit on every web/mobile
  claim in this repo, not a one-off.

See [[db-table-conventions]], [[migration-journal-corrupt]] (hand-author every migration),
[[shift-overlap-rules]].
