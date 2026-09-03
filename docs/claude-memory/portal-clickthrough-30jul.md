---
name: portal-clickthrough-30jul
description: "HOW to click both web portals through on real password logins (the step that was blocked for days) and what the first pass found 30 Jul 2026 — everything held, one label bug fell out on sight, and the draft-invisibility proof"
metadata: 
  node_type: memory
  type: project
  originSessionId: e6a0525f-ec3a-44a2-bf33-e24471117ad8
  modified: 2026-07-30T10:09:36.994Z
---

**Both web portals driven in a browser on GENUINE password logins, 30 Jul 2026** — not minted
tokens, which authenticate the API but never populate the portal identity. This was recorded as
blocked for days. It is not blocked; it takes about ten minutes.

## The recipe

- **Start the BACKEND first** (`preview_start` name `backend`, port 7777), then `web` (port 3000).
  If the API is down, `kickToLogin()` clears the tokens on the first failed call and a fine session
  looks broken — see [[web-auth-tokens-not-persisted]].
- `.claude/launch.json` already defines `backend`, `web`, `web-3001`, `mobile`. Use it.
- **Log in at `/en/login`** — the app is locale-prefixed ([[locale-prefix-hard-navigation]]).
  Agency `owner@atlas-agency.my` / `Password123!`; outlet `owner@velvet23.my` / `Password123!`.
- **Use a SEPARATE TAB per portal.** jk pinned tokens per-tab in `sessionStorage` (`auth-storage.ts`),
  precisely so a second login cannot hijack the first tab's identity. `tabs_create` then navigate.
- `get_page_text` is far cheaper and clearer than screenshots here; screenshots fail outright when
  the Browser pane is not displayed.

## What the first pass proved

- **Agency Subscription**: collections renders live (`Velvet 23 · RM 700.00 · 1 shift`, drafted);
  subscription record shows a correct empty state with the honest "does not say whether a given week
  was paid" wording.
- **Outlet Subscription**: the row reads **Active**, not "Paid" — [[subscription-record-not-invoice]]
  holds against real data. `/outlet/special-service` gives the phase message, not a role error —
  [[phase-flags-vs-permissions]] holds.
- **The best result was unplanned: draft statements are invisible to the venue.** Agency sees
  `Drafts · RM 700.00 · no outlet has been shown these yet`; the outlet, same week, sees
  `No statements yet`. The controller's draft filter, proven across two portals at once.
- Zero console errors on either portal.
- **Still NOT exercised: collections issue/settle** — forward-only, no undo, shared DB.

## The bug it found on sight — the 5th of its class, and mine

The check-in card rendered `Within fence · 69 m · ±22 m` under a per-venue header reading
`1/1 within 50 m`. Both true; together, a lie. **`inRange` is radius + `min(accuracy, 30)`**,
mirroring the door's own rule, so 69 m against a 50 m pin at ±22 m legitimately passes — the header
claimed a precision the test does not use. Now `1/1 within fence · 50 m pin` (`50e632c`); the
panel-level summary was already worded correctly.

**Only a live render could show it** — it needs a real fix sitting *between* the radius and the
radius-plus-buffer. No amount of reading produces that. Same class as the four in
[[pv-detail-merge-convergent-fix]].

**Also corrected:** more venues are fenced than [[geofence-live-verified]] records — **Emhub Testing
and JK House both have 50 m pins**, not Velvet 23 alone.

**How to apply:** run this after any change to a money or access surface. Two of the five
label-class bugs on this project were only visible in a render, and this pass cost minutes. See
[[live-role-sweep-30jul]] for the API-level equivalent.
