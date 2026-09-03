---
name: outlet-shift-read-access
description: "Outlet History fully wired & live-verified; outlet shift + shift-assignment read access done. Only outlet TODAY remains (big job)"
metadata:
  node_type: memory
  type: project
  originSessionId: 6176760a-5082-4f1f-bf9b-a98e3d22395c
  modified: 2026-07-20T02:25:01.313Z
---

Started 2026-07-20: making the outlet **Today** and **History** screens real. Owner is the user (Outlet + Agency parts) — see [[dont-touch-backend]].

**HISTORY: DONE and live-verified (still uncommitted on branch SL as of 2026-07-20).** No migration was needed anywhere — `shift.outlet_id` and `shift_assignment` already existed.

Backend read access (both features now `canRead = admin|agency|outlet`, `canWrite = admin|agency`):
- `shift.*`: routes split, `resolveScope` 3rd branch resolves `outletIds` from `outlet_member`, `ShiftFilter.outletIds` + `inArray`.
- `shift-assignment.*`: same pattern. `listPaginated` now innerJoins `shift` (lossless — FK notNull) so an outlet can be scoped by venue, and leftJoins `pr` to return `prName` / `outletId` / `shiftDate` inline. **That join is required**: outlets cannot read `/pr` at all (still agency|admin), so the PR name has to ride along on the assignment.
- Verified live: outlet sees 18 completed / 25 total for its own outlet only; agency unchanged at 52 across its 2 outlets; cross-outlet getById 404; outlet POST + DELETE 403.

Seeds (idempotent, each keyed on its own `createdBy` ACTOR):
- `seed-sample-shifts.ts` — 40 shifts, dates relative to today.
- `seed-sample-shift-assignments.ts` (new) — 119 assignments, 83 completed. Derives everything from existing shifts + `pr` rows; sealed→completed with pay + 8pm–2am stamps, confirmed→confirmed, open→assigned.

Frontend:
- `shiftHistoryRowFromAssignment` now takes `shiftDate: string` instead of the whole `shift` (agency call site updated) so both portals share it.
- New `use-outlet-history.ts` — completed assignments + the `/agency` directory for names. Needs no `/shift` and no `/pr` read.
- `/outlet/history` gated on `backed`; the demo store is still the fallback.
- Verified in browser as owner@velvet23.my: "18 PR shifts · 14 Jul – 19 Jul · RM 3,366 paid out", 4 real PR names, "Atlas Agency", no console errors.

**TODAY: DONE too (89498e4), read-only.** Tonight's card is real: event, slot, demand/supplied, pay, status, live sales, plus the rostered PRs by name and tier.

- Needed a THIRD read-access grant: `/pr` canRead now includes outlet, scoped by `PrFilter.assignedToOutletIds` (EXISTS over shift_assignment ⋈ shift). Verified: outlet sees only the 4 PRs rostered at its venue, POST 403, agency unchanged.
- `backend-shift-map.ts` is now the single shift/assignment→demo-shape mapper; `use-roster-slots` was refactored onto it. Adds `shiftRequestFromBackendShift`.
- `use-outlet-today.ts` returns `{shifts, roster, prs}` — **all three must be passed together**. A card's `prs` are assignment PR ids that the panels resolve against roster slots AND PR records, silently dropping ids they can't resolve; passing shifts alone rendered "4/5 PRs" beside "No PRs yet".
- `OutletBookings` / `OutletShiftDetailPanel` / `OutletTodayOperationPanel` take optional `shifts`/`roster`/`agencyPrs` overrides, defaulting to the store — that's the pattern for wiring any other demo-store screen.

**CALENDAR: DONE too (3aeaeb4).** Careful — the Calendar page is `routes/outlet/ratings.tsx` (→ `OutletOperationsCalendar`), NOT `/outlet/bookings`, which is Post Job. `useOutletToday({lookbehindDays, lookaheadDays})` now takes a window (calendar passes ±90; the window is in the query key so the two fetches don't clobber each other).

**Slot format trap:** the demo time helpers expect `"HH:MM - HH:MM"`, but the backend `shift.slot` is free text (`"8pm - 2am"`), so `parseShiftWindow` silently defaulted and every calendar day read `12p–12p` (and roster windows/estPayout came out empty). `normalizedSlotLabel` / `normalizedSlotWindow` in `backend-shift-map.ts` fix this at the boundary. **Both mappers must emit the same normalized string** — the panels join roster slots to a shift on `slot.shift === shift.shift`.

**Deliberately still demo on Today:** every live-ops write (log sales, check-in, release early, cut-loss) — outlets have no writable assignment endpoint — plus drink menus, receipt scans and tied offers, which have no backend at all. Cosmetic gap: PR cards show `0cm · 52kg · 0y` and `0★` because `managedPrFromBackend` has no backend for physicals/rating (pre-existing, same on the agency Manage-PR screen).
