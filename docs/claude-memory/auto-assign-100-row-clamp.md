---
name: auto-assign-100-row-clamp
description: "FIXED 13 Aug 2026 (740c0fc) — a server pageSize clamp silently truncated SEVEN shared-cache-key queries; the SHAPE of the fix is the lesson"
metadata: 
  node_type: memory
  type: project
  originSessionId: b8a19f55-ce7f-4e10-93f4-01a75e27fbd7
  modified: 2026-08-13T05:14:32.341Z
---

**FIXED 13 Aug 2026, commit 740c0fc**, together with the three smaller gaps
below. Kept because two things here generalise well beyond auto-assign:

1. **Asking for `pageSize: 500` returns 100 rows and no error.** A truncated page
   is indistinguishable from a short one. Anything that needs a COMPLETE set must
   page to exhaustion — `apps/web/src/lib/fetch-all-pages.ts` now does it.
2. **🔴 The blast radius was the SHARED CACHE KEY, not the one hook.** Seven
   hooks/components read `["roster","assignments"|"prs"|"shifts"]`. React Query
   stores one value per key, so whichever fetched FIRST decided what every other
   consumer saw — fixing the planner alone would have fixed **nothing**, because
   `RosterBackendTimetable` would still have filled that key with 100 rows. And
   each `useQuery` infers its type from its own `queryFn`, so **a shape mismatch
   type-checks cleanly and only explodes at runtime**. That is why `fetchAllPages`
   returns `{ data }` rather than a bare array: it keeps every
   `q.data?.data ?? []` reader correct and lets all seven move one line each.
   **Before changing the shape of a shared-key query, grep the key.**

Two follow-ups deliberately left open (also in `TEST_SCRIPT.md` §9): the
swap-target PICKER still offers by headcount only (approval now refuses cleanly
with its own message), and `hasFreeSeat` still takes no row lock — locking the
shift on every status PATCH would put a write lock on check-in/check-out, the
busiest path, to guard the quietest.

The original diagnosis follows, because the reasoning is the useful part.

---

Audited 13 Aug 2026 when the owner asked whether the AI Suggestion respects the
per-tier slot rule. **The rule itself holds where it matters** — `POST
/shift-assignment` checks headcount then `seatFor` under `SELECT … FOR UPDATE`
(`shift-assignment.repository.ts:280-364`), and the frontend tier mapping in
`auto-assign.ts:57-78` is byte-identical to the backend leaf `tier-demand.ts:29-58`.

**The dangerous gap is pagination, not the rule.**

`use-auto-assign-plan.ts:74-95` asks for `pageSize: 500`. Every controller clamps
to `MAX_PAGE_SIZE = 100` (`shift-assignment.controller.ts:60`, applied `:75`;
same in `shift.controller.ts` and `pr.controller.ts`). Nothing reads
`pagination.totalCount` or fetches page 2.

The assignments query is the killer: `listPaginated` applies **no date filter**
and orders `ShiftAssignmentTable.createdAt` **ASCENDING** (`:705-706`). So
`weekAssignments` is the agency's **oldest 100 assignment rows, ever**. Past 101
lifetime rows, this week's are all beyond the cutoff and `staffedByShift` is
empty for every current shift. Then, in one cascade:

- every shift reads fully unstaffed (`openSlots = quantity - 0`)
- `staffedBuckets` is `[]`, so `remainingByBucket` returns the full asked counts
  and tiers already at quota are waved through
- `busyDatesByPr` is empty, so already-booked PRs get proposed
- `validateAutoAssignPairs` refetches with the **same broken query**, so it drops
  nothing — the last-second guard is blind for the same reason the plan is

Every pair then 409s, and the toast says *"N assignments could not be made —
please retry"*, which is advice that can never work.

**Live on 13 Aug 2026: 44 `shift_assignment` rows, ALL Atlas. Not yet firing.**
It starts at row 101 with no error anywhere — the plan just quietly becomes
fiction.

Fix: date-scope the assignments query (the shifts query already carries
`fromDate`/`toDate`) or page to exhaustion. Same clamp affects
`use-roster-slots.ts:27-51`, which shares the cache keys.

**Three smaller gaps found in the same pass**, all recorded in `TEST_SCRIPT.md`
§9 with file:line:

1. `validateAutoAssignPairs` never re-checks the tier mix — `DropReason` is only
   `shift-gone | shift-full | pr-busy` (`auto-assign.ts:418`). The server's real
   message is lost twice: axios throws `"Request failed with status code 409"`,
   and `AutoAssignSheet.tsx:98-103` renders only `failed.length`.
2. **Two write paths bypass the tier guard entirely**: re-staffing a cancelled
   row via `PUT /shift-assignment/:id` → `hasFreeSeat` (quantity only), and
   **outlet-swap approve** (`outlet-swap.repository.ts:245-258`), which never
   reads `ShiftPayTierTable` at all. Both land rows `POST` would refuse.
3. "N open slots" doesn't subtract tier-unfillable seats, so a shift wanting 4×
   Tier I with only Tier IIIs free reads *"4 open slots / No free PRs"* — false.

⚠️ **Comment rot**: `auto-assign.ts:440-443` and `use-auto-assign-plan.ts:125-127`
still claim the backend "does NOT enforce a shift's `quantity` … it only checks
agency ownership". True when written, **false since the seat guard landed**.

See [[fix-named-by-symptom-hides-siblings]] and [[green-signals-that-lie]] — a
clamp that silently truncates is exactly the instrument problem in
[[absent-evidence-is-about-the-instrument]]. Built alongside
[[pr-card-att-paid-live]].
