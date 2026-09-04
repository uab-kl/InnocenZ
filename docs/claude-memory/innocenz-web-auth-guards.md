---
name: innocenz-web-auth-guards
description: "How InnocenZ web route guards actually execute (SSR no-op, ssr:false requirement, role guard design, react-query hidden-tab retry pause)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 918ba17c-f283-45ff-a9d9-1c12754acb29
  modified: 2026-07-29T14:14:54.660Z
---

- Auth is client-only (localStorage tokens; roles come ONLY from GET /auth/me — the JWT payload has just `loginMethod`/`loginCriteria`). TanStack Start runs route `beforeLoad` on the server during SSR where every guard early-returns (`typeof window === 'undefined'`), and it does NOT re-run on the client for a direct URL entry — so a beforeLoad-only guard is silently bypassed by typing the URL. Fix: set `ssr: false` on the guarded layout route (supported in the installed router 1.170.x); then beforeLoad always runs client-side. `/admin` has this (2026-07-29, `apps/web/src/routes/admin/route.tsx` + `apps/web/src/lib/auth/admin-guard.ts`); `/agency` and `/outlet` still only call `ensureAuthenticated()` without `ssr: false`, so their direct-entry path is still unguarded.

- `ensureAdminRole(queryClient)` pattern: demo sessions (fake JWT, emails `demo@atlas-agency.invalid` / `demo@velvet23.invalid`) must be short-circuited by decoding the token BEFORE calling /auth/me — the backend 401s their fake token and `kickToLogin` would destroy the demo session. Real roles resolve via `queryClient.ensureQueryData` on `profileQueryKey` (shares the header's useProfile cache; one /auth/me per page load). Redirects: admin→through, agency→/agency, outlet→/outlet, other→/no-access, fetch failure→fail closed to /login.

**Why:** guard placement looked done but was a no-op for the most common attack path (typed URL); and react-query pauses RETRIES (not first attempts) while `document.visibilityState` is hidden — a guard with `retry>0` hangs a background/hidden tab on a blank pending page forever, which is also why awaited queries "never settle" in the non-displayed Browser pane.

**How to apply:** any new role-gated route: `ssr: false` + beforeLoad guard with `retry: false`; test direct URL entry, not just SPA navigation. Related: [[innocenz-dev-environment]], [[innocenz-plan-change-flow]].
