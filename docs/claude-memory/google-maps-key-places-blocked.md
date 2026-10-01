---
name: google-maps-key-places-blocked
description: "GOOGLE_MAPS_API_KEY allows Geocoding but BLOCKS Places API (New) (403 on searchText + autocomplete, 29 Sep 2026) — typed address search falls back to one geocoder match"
metadata:
  node_type: memory
  type: project
  originSessionId: 9b91b63a-a374-4bab-8706-1adf2e265fbb
  modified: 2026-09-29T03:38:43.096Z
---

Checked 29 Sep 2026 with the server key from the repo-root `.env`: the Geocoding API works
(`region=my`), but Places API (New) `places:searchText` and `places:autocomplete` answer
**403 PERMISSION_DENIED — "Requests to this API … are blocked"**, and the legacy Places
`findplacefromtext` answers REQUEST_DENIED ("legacy API … not enabled").

**Why it matters:** the geocoder gives ONE best match ("1 Utama", "Sunway Pyramid" → 1 result),
so the outlet geofence search could never offer a list. `apps/backend/src/features/outlet/geocode.ts`
`searchLocations()` now tries `searchPlaces()` first and falls back to `geocodeAddress()`; the
server logs one warning while the key is blocked.

**How to apply:** a single option in Settings → Attendance is the fallback, not a bug. The fix is
owner-side: Google Cloud → enable "Places API (New)" and add it to the key's API restrictions.
A geocoder answer can be a named place with only a suburb address (UAB Emhub → "Kota
Damansara", `partial_match`) — never let such a match overwrite a typed street
(`geocodeLosesDetail`). "Emhub" IS found (same place_id for "Emhub" and the full address):
Google's own listing has no street, so it is GEOMETRIC_CENTER and nameless via the geocoder —
the card now reads it as "Google's pin for this place" (`isPlace`), not "Block centre".
⚠️ A result's viewport (~424 m) is Google's DEFAULT for any point — it is not a place's size;
don't quote it as one. Related: [[innocenz-r2-buckets]], [[geofence-live-verified]],
[[confirm-before-asserting]].
