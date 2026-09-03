---
name: agency-portal-port
description: How the agency portal was ported from InnocenZ-proto into apps/web and how demo login works
metadata: 
  node_type: memory
  type: project
  originSessionId: 99e51269-5dac-4554-b863-5d6151c58dd4
---

The agency portal in `apps/web` is a wholesale port of the InnocenZ-proto agency
section, not backend-wired UI.

- **Namespace:** proto `src/{lib,components,hooks}` + `prototype-theme.css` were
  copied to `apps/web/src/agency-portal/` under the `@agency-portal/*` alias
  (defined in `apps/web/tsconfig.json` paths and package.json imports). All the
  copied files had their `@/` imports rewritten to `@agency-portal/`.
- **Routes:** the proto `agency.*` route files were consolidated into the
  directory-based folder `apps/web/src/routes/agency/` (URLs stay `/agency/*`):
  `route.tsx` is the layout, `index.tsx` is the hub, siblings are `roster.tsx`,
  `pv.tsx`, `prs.tsx`, `profile.tsx`, `pending.tsx`, `outlets.tsx`, `live.tsx`,
  `history.tsx`, `subscription.tsx`, `special-service.tsx`. (Previously they sat
  in a pathless group `(agency)/agency.*`; moved out of it — the old `(agency)/`
  folder is gone.) `agency/route.tsx` adds an `ensureAuthenticated` guard, a
  client-only mount gate (the portal is a zustand/`window` demo island — must not
  SSR), and imports the theme CSS. A leftover `agency/dashboard.tsx` placeholder
  stub also exists (login.tsx redirects a real `agency` role to `/agency/dashboard`).
- **State/data:** driven entirely by the proto's `zustand` demo store
  (`@agency-portal/lib/store`, persisted under localStorage key `innocenz-store`).
  No backend calls — content is demo seed data (Atlas Agency owner is
  "Dato' Lim Wei Khoon").
- **Login:** `owner@atlas-agency.my` / `password` is a frontend demo bypass in
  `login.tsx` → `@/lib/auth/agency-demo-session.ts` (sets placeholder JWT-shaped
  tokens + seeds the store as `agency_owner`) → redirects to `/agency`. This
  account does NOT exist in the backend.
- **Real agency detection:** `@/lib/auth/post-login-redirect.ts` calls `GET /auth/me`
  after a real login; roles include `{id, roleName}` and the agency role is
  `roleName === 'agency'` (also `VITE_AGENCY_ROLE_ID`). Backend roles are seeded
  `['admin','agency','pr','outlet']` (backend `init-roles.ts`). Login response and
  the JWT payload carry NO role — only `/auth/me` does.
- Sign-out (`@agency-portal/lib/go-welcome.ts`) clears app tokens + demo store and
  returns to `/login`.
- **Demo vs real data split (session-kind):** `login.tsx` routes the two demo
  emails (`owner@atlas-agency.my`, `owner@velvet23.my`) through
  `startAgency/OutletDemoSession` (seeded; `localStorage iz-session-kind="demo"`).
  Any real backend login goes through `startAgency/OutletRealSession`
  (`iz-session-kind="real"`, sub-role defaulted to owner). The portal layouts
  (`agency/route.tsx`, `outlet/route.tsx`) call
  `useStore.setState(buildBlankPortalReset())` (in `demo-seed.ts`) on mount when
  the kind is `real`, so real accounts see the same pages with store data blanked.
  Must run every mount because the persist `merge` re-seeds empty slices on reload.
  **Known gap (deferred 2026-07-16):** page components with `x?.length ? x : SEED`
  fallbacks still show demo values for real sessions — e.g. `agency/index.tsx`
  pending-payout falls back to `LIVE_SEED_PR_PVS`, total-outlets uses the
  `OUTLET_NAMES` constant. Needs a per-page pass to strip those fallbacks (store
  blanking can't reach them). See [[dont-touch-backend]].
- **Outlet portal** is ported the same way and was also consolidated into the
  directory-based folder `apps/web/src/routes/outlet/` (`route.tsx` layout,
  `index.tsx` hub, siblings `workspace.tsx`, `bookings.tsx`, `billing.tsx`,
  `history.tsx`, `profile.tsx`, `ratings.tsx`, `settings.tsx`, `subscription.tsx`,
  `special-service.tsx`; old `(outlet)/` group removed). Layout `outlet/route.tsx`
  uses `PortalShell portal="outlet"` + `outlet-rbac`. `outlet/dashboard.tsx`
  redirects `/outlet/dashboard` → `/outlet` (login.tsx sends a real `outlet` role
  there). Demo login `owner@velvet23.my` /
  `password` → `startOutletDemoSession` (sets `role:"vendor"`,
  `outletSubRole:"outlet_owner"`, Velvet 23 owner) → `/outlet`. Real backend
  outlet accounts (`roleName === 'outlet'`) also route to `/outlet` via `/auth/me`.
- Shared portal CSS tweaks live in `@agency-portal/agency-app-overrides.css`
  (imported by both `agency/route.tsx` and `outlet/route.tsx`): full-width
  pages (`.iz-portal .iz-screen`/`.iz-portal-page` max-width:none), hide the
  WhatsApp button in portals, and the collapse-to-icons sidebar handle
  (`.iz-portal-collapse-toggle`, rendered by PortalShell for both portals).
