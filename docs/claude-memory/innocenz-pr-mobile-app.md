---
name: innocenz-pr-mobile-app
description: apps/mobile is the PR app (port of InnocenZ-proto /host view); demo login +60123456789/password; shift data still demo-only
metadata: 
  node_type: memory
  type: project
  originSessionId: 0cb8340d-a873-4dee-a7c3-e68ed9fbb9b6
  modified: 2026-07-30T15:47:43.818Z
---

- `apps/mobile` (Expo, `pnpm dev:mobile`) is the PR portal ported from InnocenZ-proto `/host?view=shifts` (built 2026-07-19, full feature set 2026-07-20: schedule calendar+timetable, check-in/out with GPS+selfie bypassed via `GPS_BYPASS` in shift-session, payroll Payment tab, History shifts+payment views, Profile with comcard/portfolio + Edit that PATCHes `/user/:id`). Identity, agencies (`/agency/memberships`), profile edits and images are live from the backend (`/api/v1/auth/login` + `/auth/me`, port 7777); shift/PV/notification content lives in `apps/mobile/src/lib/demo-shifts.ts` and mirrors the proto seeds because the backend has no shift/roster/PV tables yet. Backend `PATCH /user/:id` was extended to persist firstName/lastName/email (self-edit only).
- PR demo login: ID `60123456789`, password `password` → Vicky (`pr.vicky@innocenz.demo`). Seeded by `apps/backend/src/scripts/seed-sample-prs.ts` (Vicky has a per-PR password override; other PRs remain `Password123!`). The app normalizes the typed ID to `+60123456789`.
- `tools/scripts/dev-mobile.mjs` now reads root `.env`, passes `PORT=BACKEND_PORT` (7777) to the backend and `EXPO_PUBLIC_API_URL` to Expo — restart `pnpm dev:mobile` after pulling for these to apply.
- Theme tokens ported 1:1 from proto `prototype-theme.css` into `apps/mobile/src/theme/theme.ts`; fonts injected via Google Fonts on web only. `useWindowDimensions` reports a stale width on RN-web in the embedded browser — use `src/lib/viewport.ts` (`useViewportSize`) instead.
- In the Claude browser pane, Expo web verifies fine via `read_page`/`javascript_tool`, but `computer screenshot` times out consistently — don't burn time retrying it. Related: [[innocenz-dev-environment]].
- Driving the RN-web UI (confirmed 30 Jul 2026): `form_input` sets the DOM value but React state never sees it, and `computer` clicks on `ref_N` miss after a viewport resize (stale coordinates). Reliable recipe: set inputs via the native value setter + `dispatchEvent(new Event('input',{bubbles:true}))`, and press RN Pressables by dispatching `pointerdown`/`pointerup`/`click` PointerEvents at the element's bounding-box center via `javascript_tool` (find buttons with `document.querySelectorAll('[tabindex]')` + textContent match). Launch via `preview_start {name:"mobile"}` (launch.json, port 8081); first Metro crawl can take ~2 min before :8081 responds — poll with curl, don't assume failure.
