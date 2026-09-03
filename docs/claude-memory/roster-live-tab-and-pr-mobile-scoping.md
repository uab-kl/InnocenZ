---
name: roster-live-tab-and-pr-mobile-scoping
description: "Agency Roster Live tab now reads the backend (not demo store); PR mobile shifts are scoped by logged-in user's pr row"
metadata: 
  node_type: memory
  type: project
  originSessionId: 702c648d-ffd7-4f72-9228-f76992f20f48
  modified: 2026-07-29T04:08:04.039Z
---

Two roster-visibility issues fixed/diagnosed 2026-07-23 (branch SL, uncommitted).

**DB STATE:** on 2026-07-23 I TRUNCATEd `main.shift`, `main.shift_assignment`, `main.shift_pay_tier`, `main.shift_sale` (RESTART IDENTITY CASCADE) on the shared remote `innocenz-test` at user request, to start fresh test data — so those tables are near-empty now (just the outlet-posted test shifts since). Shared DB: coworker's shift data was wiped too.

**Agency Roster — Live tab was demo-only, now backend-wired.** In `apps/web/src/routes/agency/roster.tsx` the Planning tab read the backend (`useRosterSlots`) but Live read the client-side demo store, so backend shifts (e.g. one booked in Planning) never appeared in Live and never showed for a coworker (Live is also the default tab on load). Fix: `agencyRoster = backendRoster.slots` for BOTH views; Live pins the fetch window to `DEFAULT_ROSTER_DATE_ISO` (today). Removed now-unused `demoAgencyRoster` / `rosterSlotsForAgency` / `allAgencyRoster`. Demo overlays (GPS, swaps, outlet-requests) degrade gracefully. Live-verified: Vicky's Velvet 23 22:00-04:00 shift now shows in Live, RM 500. See [[outlet-post-job-today-calendar]].

**PR mobile (apps/mobile) reads real backend** via `/shift-assignment/mine` (`AgencySchedulePanel` -> `useActiveShift` -> `fetchMyShiftAssignments`). It is scoped server-side to the pr resolved from the logged-in user (`prRepository.getByUserId`). So a shift only shows on the phone that is logged in as that PR's user. Vicky = user `93ea08b0-...`, email `pr.vicky@innocenz.demo`. Also watch the mobile API base URL: `EXPO_PUBLIC_API_URL` else `http://<host>:7777/api` — on a physical device `localhost` won't reach the PC (see [[backend-port-7777]]).

**Mobile login is PHONE-only** (LoginScreen.tsx, phone-pad; API also accepts email if identifier has `@` but the keyboard blocks it). **Vicky's mobile creds = `60123456789` / `password`** — note her password is the literal `password` (per-account override in seed-sample-pr-personnel.ts:110), NOT the `Password123!` the other demo accounts use. Verified end-to-end 2026-07-23: login by phone -> `/shift-assignment/mine` returns her Velvet 23 22:00-04:00 shift. Enter phone as `60123456789` or `+60123456789` (both normalize to stored `+60123456789`); local `012-...` format won't match.

~~**LATENT BUG:** `PrRepository.getByUserId` does `WHERE user_id=$1 LIMIT 1` with NO agency scope / ORDER BY. Multi-agency PRs have one `pr` row per agency sharing a user_id (Vicky has 2).~~

**CLOSED — verified against the live DB 29 Jul 2026. Do not "fix" `getByUserId`.** Migration
**`0056_merge_duplicate_pr.sql`** merged the duplicates and `main.pr` now carries a UNIQUE index
**`pr_user_id_unique`** on `user_id`. Queried live: **0 users with more than one `pr` row**, 6 pr
rows all linked. A second row is now impossible, so `limit(1)` cannot pick the wrong one and the
code is correct as written.

**What the constraint actually means, and it is a product question not a bug:** a PR **cannot
belong to two agencies** through the `pr` table at all. If multi-agency PRs are ever required,
the change is at the schema level — make `agency_pr` the real many-to-many and retire
`pr.agency_id` — not at `getByUserId`.
