---
name: web-auth-tokens-not-persisted
description: "Tokens ARE persisted to localStorage; a failed API call wipes them via kickToLogin — so a browser click-through needs the backend running, or you get bounced to /login"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c5ccb3a-1b60-4b89-b695-e6bf764672ea
  modified: 2026-08-04T02:26:25.852Z
---

**Corrected 29 Jul 2026 — the first version of this note was wrong.** It recorded "no token
anywhere, tokens appear to live in module memory". That conclusion was drawn from a localStorage
snapshot without checking the code, and the code says otherwise.

## Tokens are persisted, in plain localStorage

`apps/web/src/lib/auth/auth-storage.ts` — `saveAuthTokens()` writes three keys synchronously:

- `access_token`
- `refresh_token`
- `token_expiry`

No `iz-` prefix (which is why an `iz-`-focused scan missed them). They survive a page load fine.
**A real backend login persists its token.**

## ⚠️ CORRECTED 4 Aug 2026 — tokens are PER-TAB now, and localStorage is only a SEED

`auth-storage.ts` has been rewritten since the note above: **the live store is `sessionStorage`**,
with the three localStorage keys kept only as a one-time seed for a brand-new tab (`auth_seeded`
pins the tab afterwards). The header comment says why: one shared slot meant logging into a second
portal in another tab overwrote the only token, and the first tab silently became the other role.

**This makes the localStorage `access_token` a LEFTOVER, not the session.** It is whatever role
logged in most recently *anywhere*, while each tab keeps whoever signed in on it.

**It cost a false security alarm on 4 Aug.** On the outlet Ratings screen, a hand-rolled
`fetch` using `localStorage.access_token` returned **another outlet's rating** while the session
read "Emhub Testing" — which looks exactly like a cross-tenant leak. It was not. That key held a
stale `owner@atlas-agency.my` token from an earlier login in the same browser, and `GET /rating`
had correctly scoped it to the *agency's* PRs. The app uses `getAccessToken()` and was on
`emhub@emhub.test` the whole time. **When probing a live session by hand, read the token through
`getAccessToken()` — never off localStorage — or you are testing a different identity than the app
is.** Decode the JWT's `loginCriteria` before believing any scoping conclusion.

Useful consequence: **you can log into a second role in a NEW tab without disturbing an existing
tab's session.** Only the localStorage seed (and so future new tabs) changes.

## What actually emptied them

`lib/auth/guards.ts` has two clearers:

- `ensureAuthenticated()` clears only when there is *already* no access token, then redirects —
  so it cannot wipe a good one.
- **`kickToLogin()` calls `clearAuthTokens()` and hard-redirects to `/login`.** It is the
  `onRefreshFail` / `logout` callback threaded through every service function (`fetchShifts`,
  `fetchPrPersonnel`, …).

So **any failed API call — 401 or an unreachable server — wipes all three keys and bounces to
the login screen.** In the failed verification: a demo session was started (fake `alg:"none"`
JWT), the agency portal mounted and fired real backend queries, **no backend was running on
7777**, the refresh path failed, `kickToLogin()` ran, and by inspection time localStorage held
only `iz-session-kind` and `innocenz-store`. Persistence was never the problem.

## Test credentials (verified working 29 Jul 2026)

**The passwords are NOT uniform — this cost a round of guessing.** Dev-seed accounts on the shared
`innocenz-test` DB.

| account | password | role |
|---|---|---|
| `owner@atlas-agency.my` | `Password123!` | Atlas agency owner |
| `emhub@emhub.test` | `Password123!` | Emhub Testing outlet owner |
| `pr.vicky@innocenz.demo` | **`password`** | PR (mobile) |
| `owner@velvet23.my` | `Password123!` | Velvet 23 outlet owner — **the only outlet with a rating** |

Other agency owners (`owner@delta-agency.my`, `hello@starline.my`) are also `Password123!`. Only
Atlas has data worth looking at. See [[agency-login-has-no-backend-account]].

## What this means for a browser click-through

- **Start the backend first** (see [[backend-port-7777]]) — without it you will be ejected to
  /login within a second of reaching any portal page, and it will look like a broken session.
- A **demo** session cannot survive the agency portal at all, because those pages call the real
  backend and the fake JWT is rejected. Demo is only viable on screens that read the store.
- ~~The app is locale-prefixed (`/en/...`), but `window.location.assign("/agency")` in the login
  flow omits the prefix~~ **FIXED 29 Jul 2026 (`05ee588`)** — login now lands on `/en/agency`
  with the portal rendered. See [[locale-prefix-hard-navigation]] for the rule that keeps it
  fixed.

Verified from source, not re-tested live: the mechanism above is read off `auth-storage.ts` and
`guards.ts`. A real login with the backend up would confirm it end to end.
Related: [[demo-data-leaks-into-real-sessions]], [[agency-leave-approvals-tab]].
