---
name: duty-status-and-checkin-display
description: "RULE: attendance stamps beat the shift clock on BOTH portals; check-in is deliberately not time-boxed; check-in renders as local time not raw UTC"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c5ccb3a-1b60-4b89-b695-e6bf764672ea
  modified: 2026-08-06T08:21:06.255Z
---

Fixed 29 Jul 2026 (`3b9e46a`, `4790022`) after the agency roster showed a PR "On duty" while the
outlet's Today card showed the same person "BOOKED".

## The rule: a real stamp beats the shift clock

Both sides were internally consistent and disagreed anyway.

- **Agency** — `backend-shift-map.ts` `liveRosterStatus()`: checked in and not out ⇒ `on-duty`,
  whatever the row's enum says. A `confirmed` row is only *scheduled* until the PR actually
  arrives.
- **Outlet** — `OutletTodayOperationPanel.resolveFloorPrDisplayStatusFromSlot()` gated everything
  behind `outletShiftClockStarted()` **and returned early**, so the real check-in test three lines
  below was unreachable until the shift began.

The outlet now checks `checkedOutAt` / `checkedInAt` FIRST. The clock still governs everything
below them — that is what it was actually protecting: an unstamped PR is at most `en-route` before
the shift, and demo floor activity must not invent an on-duty PR for a shift that has not begun.
**If you touch either function, keep them agreeing.**

## Check-in is NOT time-boxed, on purpose

`checkInMine` validates the geofence but **not** the time window, so a PR can stamp in hours
early — that is how a 12:01 pm check-in existed for a 22:00 shift. Left that way deliberately so
the team can exercise post-check-in flows outside shift hours. If it is ever tightened, the guard
belongs in `checkInMine`, and doing so would make the display question mostly moot.

## Check-in renders as local time — the helper is `lib/attendance-stamp.ts` (amended 6 Aug 2026)

`RosterShiftTable` printed the raw UTC ISO string (`2026-07-29T04:01:04.748Z`). Unreadable, and
misleading: **04:01Z is 12:01 pm in Malaysia**, so a lunchtime check-in looked like a 4am one —
part of why the on-duty mismatch was confusing to reason about. The formatter shows local time
(`12:01 pm`), prefixing the date only when the stamp did not land on the shift's own date
(`31 Jul · 2:30 am` — a shift past midnight, or an early check-in). Full stamp stays on hover via
`title` in the roster cell.

🔴 **6 Aug: it was `formatCheckInStamp`, PRIVATE to `RosterShiftTable` — so this rule reached exactly
one cell.** Four other sites printed the same field raw, and the owner caught the worst of them from
a screenshot: the outlet Today card read **`Out 2026-08-06T06:17:45.947Z · Atlas Agency`**. Now
exported from the leaf module **`lib/attendance-stamp.ts`** as `formatAttendanceStamp(stamp, shiftDateIso?)`
— zero imports, safe for anything to pull in — and called by all five: outlet Today ops line, roster
table cell, roster card `In …`, Live-workforce check-in column, roster sheet "Released early ·".
It returns an unparseable input **untouched**, which is what lets the demo store's `"21:45"` still
render as `"21:45"`. Exercised in `Asia/Kuala_Lumpur`: `06:17:45.947Z`→`2:17 pm`, `04:01Z`→`12:01 pm`.
*A helper kept private to the file that found the bug cannot reach the bug's siblings* — see
[[fix-named-by-symptom-hides-siblings]]. **If you add another stamp to a screen, import this.**

⚠️ It formats in the **viewer's** timezone, not the outlet's. Fine while everyone is in Malaysia;
pin to `Asia/Kuala_Lumpur` if anyone ever reads the roster from elsewhere.

Verified live as the Emhub outlet owner: header went "3 booked" → "1 on duty · 2 booked", Alice's
card showing ON-DUTY with her stamp, the other two still BOOKED.
