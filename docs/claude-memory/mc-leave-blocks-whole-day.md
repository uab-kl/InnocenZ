---
name: mc-leave-blocks-whole-day
description: An approved MC now writes a pr_availability day-block for every agency; it used to excuse one shift and leave the freed hours bookable
metadata:
  type: project
---

MC/Leave lives on `shift_assignment` (0049 statuses, 0112 decision triple, proof on
`leave_proof_photos`), so it is per-assignment and therefore per-agency **by construction** — the
row already carries `agency_id`. The write path was always correct: `requestLeaveMine` notifies
`existing.agencyId` only, `approveLeave`/`rejectLeave` both 404 on an agency mismatch, and the
queue read is agency-pinned. A PR on four rosters files MC **separately per shift**, and the four
agencies can decide differently. There is **no leave balance or quota anywhere** in the codebase.

The bug was in the CONSEQUENCE, not the scoping. `leave_approved` is a `NON_STAFFING_STATUS`, so
the excused hours stopped counting as a clash and read as ordinary free time to the assign guard,
which is agency-agnostic by design — being unfit for 22:00-04:00 at one venue became fitness for
20:00-02:00 at another, bookable by anyone **including the agency that had just granted the
leave**. Fixed 26 Aug 2026: `approveLeave` calls `blockLeaveDay`, which writes
`pr_availability` for `shift.shift_date` through the existing idempotent upsert.

**Why:** the trap was in a second place and is the part worth remembering — `blockMine` refuses a
day the PR is still rostered on, so a SECOND agency **rejecting** the same MC (a rejection reverts
the row to `assigned`) locked them out of `pr_availability`, the only switch that blocks a day
across all agencies. The 409 then named the remedy that had just been refused: "cancel the shift
or request leave instead". A guard whose refusal message recommends the thing that caused it.

**How to apply:** three rules the fix rests on, each of which would be a real bug to undo.
(1) Block `shift_date` — the day the shift STARTS — because that is the exact key the assign guard
compares (`unavailable_date = shift.shift_date`); an overnight blocks the night it opens, and
blocking both days would take out the FOLLOWING night, which no MC was filed for.
(2) The reason is a FIXED neutral string, never the PR's MC text — `pr_availability.reason` is
shown to every agency via `listForAgency`, so the medical note would reach three agencies never
told about the illness, and naming the approver leaks who else they work for.
(3) It must NOT touch another agency's existing assignment: the block stops NEW bookings only.
Releasing B's shift is B's decision — see [[org-scope-guard-family]].
Because of (3) a blocked day and a live shift now coexist, so `buildScheduleDays` had to stop
testing `blocked` before `byDate` — a red "Not available" would have hidden the shift the PR must
still work. Pinned by `apps/mobile/src/lib/schedule-days.test.ts`.
Still open beside this: [[cross-agency-penalty-window]].
