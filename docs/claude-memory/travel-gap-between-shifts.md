---
name: travel-gap-between-shifts
description: "A PR could be booked 11:00-12:00 at one venue and 12:01-13:01 at another across KL — the assign guard tested overlap only, and nothing measured the space BETWEEN two shifts. Built 17 Aug 2026 as a distance-derived WARNING, not a refusal"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4810f98e-f7e6-4f4a-ae8f-9ab0f1e992ca
  modified: 2026-08-18T02:00:18.580Z
---

**`POST /shift-assignment` refused a strict `shiftsOverlap` and nothing else.** 11:00–12:00 and
12:01–13:01 do not intersect, so a PR could be booked at two venues on opposite sides of the city
with a one-minute turnaround. `listForPr` returns that person's assignments at **every** outlet, so
this was never limited to one venue. Grep found **no cooldown / rest / travel / minimum-gap rule
anywhere in either app** — it had been wanted for a while and never built.

**The trap that hid it:** a guard that tests whether two intervals INTERSECT can say nothing about
the space between them. Overlap is a question about shared time; travel is a question about empty
time. One predicate cannot answer both, and having a correct overlap test made it feel covered.
See [[day-additive-caps-hide-duplicates]] — same slice, opposite mistake: a rule was briefly put on
the VENUE (no back-to-back posting) when it belonged to the PERSON.

## What was built — `features/shift-assignment/travel-gap.ts`

- **Distance-derived, per the owner:** *"make the time dependent on the location of the outlets."*
  Straight line between `outlet.lat/lng` × 1.35 road-winding ÷ 25 km/h + 15 min boarding, rounded up
  to 5, capped at 180. Reuses `check-in-geofence.ts`'s haversine — **a second distance function is
  how two ends of one rule drift.** Real numbers: KLCC→Bukit Bintang (1.2 km) = 20 min,
  KLCC→Petaling Jaya (12 km) = 60 min.
- **Same outlet ⇒ 0.** Staying put needs no travel.
- ⚠️ **A missing pin returns `null`, which is NOT zero.** An unpinned venue gets no opinion rather
  than an invented distance. Callers must not collapse the two.
- ⚠️ **Measured from the ACTUAL `checkOutAt` when there is one**, the schedule only otherwise.
  **Cut-loss releases a PR mid-shift precisely so they can be sent elsewhere the same night** — from
  the scheduled end it would fight the feature the release exists for. Proven both ways: released at
  09:00 from a shift scheduled to 11:00 → silent; identical roster with no release → warns.
- **WARNS, never refuses** (owner: *"warn, but let them assign"*). The 201 gains a `warning` field;
  computed AFTER the write and wrapped, so failing to advise cannot undo a booking that succeeded.
- Web: `createShiftAssignment` returns `ShiftAssignment & { travelWarning }`, toasted in
  `use-roster-mutations` — the one hook every manual assign passes through. A warning shown by only
  some call sites teaches that silence means the trip is fine.

**AUTO-ASSIGN respects it too** (same slice). The planner skips candidates who cannot make the trip
and the confirm-time validator drops them with a `travel-tight` reason. ⚠️ **What was actually
exposed there is narrower than it looks**: the planner's date filter already stopped one PR taking
two shifts on one DATE, so the only reachable fault was **the seam between adjacent dates** — an
overnight 22:00–04:00 and an 05:00 start next morning are two `shiftDate`s and read as two free
days. Before assuming a planner bug, check what its existing filters already exclude.

⚠️ **`apps/web/src/agency-portal/lib/travel-gap.ts` is a MIRROR** of the backend module — the planner
chooses between candidates client-side and cannot ask the server per candidate. **Move the constants
together.** A probe fires both at a 12×12 coordinate grid and asserts they agree (144 pairs, 0
disagreements), which is the only thing standing between this and silent drift.

⚠️ **Every unknown fails OPEN** — no pins loaded, no pin on a venue, an unparseable slot. A venue
that never dropped its map pin therefore gets no travel checking at all; the fix is pinning it, not
loosening the rule.

**The assign dialog prices the trip BEFORE the click** — each PR in the list reads *"needs 60 min to
travel from Bukit Bintang, only 30 min free"*, from the queries the dialog already loads. The option
stays SELECTABLE: a travel note is a caution (the server's own stance), and only a blocked DATE
disables a name, because that one the API would 409. `reachProblem()` returns the numbers;
`cannotReach()` is its yes/no form for the planner — **a caller that DECIDES must not carry a payload
it could branch on**, the same split as `blockedDatesByPr` vs `blockedReasonsByPr`.

**ALL THREE SEATING LANES check it**: `POST /shift-assignment`, `PUT /shift-assignment/:id` when a
cancelled row is re-staffed, and outlet-swap approve. Three endpoints, two controllers, so the
orchestration lives in ONE `travelWarningFor()` with `loadPin`/`loadAssignments` **injected as
callbacks** — that keeps the module a leaf (it must not import the repository it reads through) and,
more importantly, keeps the "which statuses count" rule in one place. It started inline in `create`,
which is exactly how lanes two and three acquire a slightly different version of it.

⚠️ Two lane-specific traps: the PUT asks **only when `reStaffing`** (a note edit or a check-out stamp
moves nobody), and the swap resolves the PR **from the assignment, not the swap row** — the row names
an assignment, and the move changes its shift, never its owner.

**The PR's phone shows it too.** `apps/mobile`'s `request<T>` returned `body.data` and dropped every
sibling field — **advice discarded in the transport layer is advice nobody can choose to show.** New
`requestEnvelope<T>` returns `{ data, warning }` with `request` delegating to it, so the other ~90
calls keep the narrower shape. ⚠️ Any future field the server puts BESIDE `data` needs the same
treatment; `request` will silently eat it.

`useOutletSwaps` keeps `travelWarning` as its own field beside `actionError` — one says the move
FAILED, the other says it LANDED and to plan the journey — cleared on every answer so a warning about
the last swap is not read as being about the next.

⚠️ The constants are **judgement, not measurement**, and sit together at the top of the file to be
tuned. ⚠️ Proven by a 19/19 probe over the real module; **never clicked through, and nothing was
written to the shared DB.**
