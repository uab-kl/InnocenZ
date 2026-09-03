---
name: day-additive-caps-hide-duplicates
description: "An outlet posted the same 11:00-12:00 shift twice and every guard passed — because every guard measured a DAY, and a day's demand is additive. Fixed 17 Aug 2026 — an outlet's shifts may never OVERLAP (409 on create and on a timing edit); back-to-back is allowed because the real rule belongs on the PR who must travel (travel gap: designed, NOT built)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4810f98e-f7e6-4f4a-ae8f-9ab0f1e992ca
  modified: 2026-08-17T08:19:35.655Z
---

**Two identical `11:00 - 12:00` "Friday lounge" shifts (2 PRs + 3 PRs) were both accepted, and the
screen looked correct doing it.** `POST /shift` ran schema → org scope → `demandExceedsQuantity` →
`planCapacityRefusal` → insert. The Post Job composer checked the special-event name, the dress
code, the named-PR cap and the daily headcount.

**Why:** every one of those gates measures a **DAY**, and a day's demand is **ADDITIVE**. 2 + 3 = 5
is a legal day on the Essential plan whether that is two shifts or one shift said twice. The plan
cap was the ONLY thing that bounded the second post — which is why the screen read *"5 PRs/day
limit reached for Tonight"* and looked like it was working.

**The generalisable trap:** a gate that aggregates over a period cannot see a duplicate INSIDE that
period. Summing is exactly the operation that makes two rows indistinguishable from one bigger row.
When you add a cap, ask what it makes invisible.

## The overlap primitive existed and was pointed elsewhere

`shiftsOverlap` / `slotMinutes` (`apps/backend/src/util/slot-window.ts`) were correct the whole
time. Both callers ask *"is this PR double-booked?"* — assign, and the shift-timing edit. **Nobody
ever asked "do two shifts at this venue collide?"** Finding a correct helper is not the same as
finding it wired to your question. See [[fix-named-by-symptom-hides-siblings]].

## What was built (17 Aug 2026)

- **Refused server-side (409):** `slotsAreSameWindow` compares WINDOWS, so `"10:00 PM - 4:00 AM"`
  and `"22:00 - 04:00"` are one slot — `slot` is free text and string equality would miss a
  re-typed duplicate. An absent slot matches nothing; a window never equals a label.
- **Both authoring paths**, not just the reported one: `create` AND `update` (post 11:00 and 13:00,
  then drag the second onto 11:00). `update` fires only when the timing changed, or a row that was
  already a duplicate becomes uneditable — including un-duplicatable.
- **Ordered before the plan gate:** a duplicate usually also pushes the day's total up, and
  "you are over your plan" sends the venue to upgrade a plan that is not the problem.
- **A venue's shifts may not OVERLAP. Back-to-back IS allowed** — and the route to that answer is
  the lesson. The rule moved three times in one slice: exact-repeat only → any overlap → also
  back-to-back → back-to-back allowed again. The last reversal was the owner's, once the real
  question surfaced: *"if the outlet post a 11-12 and 12.01-1.01 shift can the PR who is already
  there be assigned to there?"* **The thing that actually goes wrong is one PERSON in two places
  with no time to travel — an ASSIGN-time rule. Blocking the venue's posting stopped a legitimate
  roster (11–12 and 12–13 may be two different people) and still did not stop the real fault.**
  ⚠️ When a rule keeps getting tightened, ask what the fault actually IS before tightening again —
  the guard may be on the wrong noun. `shiftsTouch` was written, shipped and **deleted** within the
  hour; deleting it was right, because dead code that reads as an enforced rule is worse than none.
- `listByOutletAroundDate` reads the day **±1 day**, and that is load-bearing, not padding: a
  22:00–04:00 shift on the 17th overlaps 02:00–06:00 on the 18th, a row filed under a DIFFERENT
  `shift_date`. Keeps `status != 'draft'` from `outletDailyPrUsage`.

⚠️ **The two live duplicate rows were never cleaned up** — nothing was written to the shared DB, and
`PUT` will not refuse an edit to them unless it moves their time. ⚠️ **Never click-verified**;
proven by a 27/27 probe over the real modules plus tsc/biome. ⚠️ **The travel gap between a PR's
shifts is DESIGNED BUT NOT BUILT** — see TEST_SCRIPT.md §9; a PR can still be booked 11:00–12:00 at
one venue and 12:01–13:01 at another. See [[write-never-landed-check-first]]
for the 30-second console test if a post ever looks like it vanished.
