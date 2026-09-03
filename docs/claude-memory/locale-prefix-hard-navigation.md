---
name: locale-prefix-hard-navigation
description: "The web app is locale-prefixed (/en/...) — every full-page navigation must go through hardNavigate(), never window.location.assign with a bare path"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c5ccb3a-1b60-4b89-b695-e6bf764672ea
  modified: 2026-07-29T03:42:46.040Z
---

Fixed 29 Jul 2026 (`05ee588`). **The rule: never call `window.location.assign` with a bare app
path.** Use `hardNavigate()` from `apps/web/src/lib/hard-navigate.ts`, which applies paraglide's
`localizeHref`.

## Why — the bug it caused

`apps/web` is locale-prefixed: the live URL is `/en/agency`, not `/agency`. TanStack `<Link>`
localizes automatically, so in-app navigation was always fine and this stayed invisible. But
every navigation that LEAVES the router used `window.location.assign("/agency")` with a bare
path. `/agency` is not a route, so the router fell through and rendered the **marketing landing
page**. That happened on **every successful login, for every role** — it looked like the login
had silently failed.

The generated runtime (`@/paraglide/runtime`) exports **`localizeHref`** and **`deLocalizeHref`**
for strings, and `localizeUrl` / `deLocalizeUrl` for URL objects (the latter pair is what
`router.tsx` uses).

## Three sites fixed, all the same class

1. **`routes/login.tsx`** — five redirects (agency/outlet demo, agency/outlet real, and the
   `ROLE_DASHBOARD[role]` admin fallback) now call `hardNavigate()`.
2. **`lib/auth/guards.ts` → `kickToLogin()`** — compared `window.location.pathname` to
   `'/login'`, which never matched `/en/login`, so it re-assigned the location even when already
   on the login screen. Now de-localizes the pathname before comparing.
3. **`agency-portal/lib/go-welcome.ts` → `welcomeHref()`** (sign out) — returned a bare
   `/login`. **Localize BEFORE prepending `import.meta.env.BASE_URL`**: the locale belongs to the
   app path, not the deploy base. `goToWelcome()` still calls `assign()` directly and that is
   correct, because `welcomeHref()` is already localized and carries the base.

## Verified live

Cleared tokens, signed in fresh as `owner@atlas-agency.my` / `Password123!` against the real
backend on 7777: lands on **`/en/agency`** with the portal rendered ("Good morning, Atlas
Agency", 11 nav links, `iz-session-kind=real`). Before the fix the identical flow ended on the
landing page. See [[web-auth-tokens-not-persisted]] for the other half of why portal
click-throughs used to fail.
