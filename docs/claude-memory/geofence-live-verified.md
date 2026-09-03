---
name: geofence-live-verified
description: "Check-in geofence proven working end-to-end 29 Jul 2026 — Velvet 23 is the live fixture; the real cutoff is radius + up to 30 m, and a pin can never be cleared through the API"
metadata: 
  node_type: memory
  type: project
  originSessionId: 851fb0c6-e2b5-42e3-b33f-6b2e7441010a
  modified: 2026-07-29T10:24:12.924Z
---

Proved the whole geofence chain live on **2026-07-29** against the running backend (7777) — outlet pin → `/geocode` → `PATCH /outlet/:id/geo-fence` → `POST /shift-assignment/mine/:id/check-in`. Everything below was executed, not read.

**Velvet 23 (`ed739c13-1fca-416b-97de-ff8ca1a7a0cd`) is now FENCED** — `lat 3.14438770, lng 101.70824200, geo_fence_radius 50`. It was `NULL/NULL/50` before. This is the only outlet in the DB that exercises enforcement at all, so it doubles as the live test fixture — but anyone testing check-in against Velvet 23 will now be refused unless they send a fix near Jalan Bukit Bintang.

Verified refusals, all **HTTP 422** (`pr.vicky@innocenz.demo` / password `password`, assignment `b9edbd18-…`):
- 1.1 km away → "You are 1112 m from the venue. Check-in is only allowed within 50 m."
- 200 m away → same shape, 200 m
- no lat/lng in the body → "Location is required to check in at this venue."
- `mocked: true` → rejected as a simulated location, *checked before* the missing-fix branch so a spoof cannot sail through as a perfect 0 m

And the converse: a fix **at** the pin returns 200 "Checked in" and stores `check_in_lat/lng/distance_m(0)/accuracy_m(8)`. I reverted that test row to `assigned` with the check-in columns back to NULL.

**The cutoff is not exactly the radius.** `allowedM = radiusM + min(device.accuracyM, MAX_ACCURACY_BUFFER_M)` where `MAX_ACCURACY_BUFFER_M = 30` (`check-in-geofence.ts`). So a 50 m fence really admits 50–80 m depending on what accuracy the phone reports. Say "50 m plus the phone's own margin, capped at 30" rather than "50 m" when anyone asks.

**A pin CAN now be cleared** — `DELETE /outlet/:id/geo-fence` shipped in `4c477d3` ("Remove pin" on the card, behind a confirm). Before that commit it was a one-way door needing SQL. Deliberately a separate verb, not nullable `lat`/`lng` on the PATCH, so `UpdateGeoFenceSchema` stays strict and a malformed PATCH still 400s rather than silently unfencing a venue. The radius survives a delete.

**`outletOwnerOnly` is proven tight** (29 Jul): `finance@velvet23.my` (finance) and `ops@velvet23.my` (operations_head) — both real active `outlet_user` rows — get **403 "requires sub-role: owner"** on BOTH the PATCH and the DELETE. A PR gets 403 too. So the fence cannot be moved or dropped by anyone but the owner.

**Removing a pin fails silently by design** — no error anywhere, PRs simply start checking in from 25 km away with a 200. Verified. That is why the UI confirms, and why nothing downstream will alert you that a venue quietly stopped being verified.

Two gotchas that cost time here: tables live in the **`main`** PG schema (`main.outlet`, not `outlet`), and the API prefix is **`/api/v1`**, not `/api`. Login returns `data.accessToken` (camel, not `access_token`). Corrects the "check-in accepts no coordinates" line in [[backend-gap-audit-verified]].
