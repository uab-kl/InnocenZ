---
name: outlet-post-job-today-calendar
description: Outlet Post Job → shift flow is DONE & verified; outlet posts now persist as confirmed (2814d91). How Today vs Calendar filter shifts. Pending user restart + optional backfill
metadata: 
  node_type: memory
  type: project
  originSessionId: d7c27bdc-1edb-44f4-bcd9-ca4aa5735901
  modified: 2026-07-23T02:03:48.264Z
---

Resume point 2026-07-23 (branch SL). Outlet Post Job → Today/Calendar is wired and verified end-to-end.

**Post Job writes real shifts (verified via live round-trip on 7777).** Outlet Post Job → `createShift` (web `use-outlet-post-job.ts`) → `POST /api/v1/shift` → controller pins the outlet, auto-routes the agency via `outlet.onboarded_by_agency_id`, inserts `main.shift`. Login owner@velvet23.my / Password123!; Velvet outlet id `ed739c13-1fca-416b-97de-ff8ca1a7a0cd`, onboarding agency = Atlas `c30fcd15-9c72-402f-a110-0d97819a06f5`.

**Outlet posts now CONFIRM on creation (commit 2814d91).** `shift.controller.ts create()` sets `status='confirmed'` for outlet callers (was the table default `draft`). Reason: Today's "live tonight" card + Calendar `isLiveTonight` only match `status==='confirmed'`. Admin/agency creates keep `draft`; client can't set status. Verified: fresh outlet POST returns status=confirmed.

**How the two pages filter (both use `useOutletToday`, gated on `backed` = real outlet_user membership):**
- **Today** = `routes/outlet/index.tsx` → `OutletBookings` (variant "home"). liveShift = `visibleShifts.find(s => s.status==='confirmed' && s.date==='Tonight') ?? find(status==='confirmed')`. Draft/open shifts DON'T show here (by design). ±0/+14 day window.
- **Calendar** = `routes/outlet/ratings.tsx` (misnamed file; title "Calendar page") → `OutletOperationsCalendar`. Renders ALL statuses (draft/open/confirmed/sealed) over a ±90 day window, so posted shifts appear here regardless of status.
- Both empty if the frontend isn't connected/backed → that (not a filter bug) was the original "didn't show on both pages" symptom, caused by the port mismatch. See [[backend-port-7777]].

**PENDING for the user (do first in the new chat):**
1. RESTART the web dev server so it picks up `apps/web/.env` VITE_API_URL=http://localhost:7777/api (vite reads .env only at startup; their running instance still had :4000). Backend already runs on 7777 — see [[backend-port-7777]]. Verify via DevTools Network → calls hit :7777.
2. The 3 EXISTING Velvet shifts for 2026-07-23 are still draft/open (created before 2814d91) — they WON'T retroactively confirm. User must post a NEW shift to see confirmed-on-Today, OR asked me to optionally BACKFILL existing drafts→confirmed (not yet done — offer this).
3. Flagged tradeoff: a confirmed shift now shows as "live" even with no PR assigned (skips agency staffing step). User accepted this.

**Session commits on branch SL (NOT pushed):** 04fa007 build-symbol restores, e63d7b9 workspace daily-wage+outlet_id (see [[workspace-tier-rate-daily-wage]]), 955c9e7 agency create-shift removal (see [[pr-cannot-accept-decline]]/[[outlet-post-job-next]]), 85da1ed backend port 7777, 2814d91 confirm outlet posts. `apps/web/.env` change is gitignored (local only). A backend dev server was left running on 7777 from the session — a fresh `npm run dev` will EADDRINUSE until it's stopped.
