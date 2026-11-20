---
name: tanstack-link-prefix-active
description: "TanStack <Link> marks itself active/aria-current by PREFIX match and overrides our own prop — hub links (/outlet, /agency, admin Organisations) lit on every child page"
metadata:
  node_type: memory
  type: project
  originSessionId: 76c5c026-418e-4b9b-8924-c12205530acf
  modified: 2026-11-20T14:29:34.998Z
---

TanStack Router's `<Link>` writes `class="active"`, `data-status="active"` and
`aria-current="page"` ITSELF whenever its `to` is a prefix of the current URL, and
that stamp wins over any `aria-current` / active class the component passes. Found
20 Nov 2026 twice in one review: outlet "Today" (`/outlet`) was marked current on
EVERY outlet page (agency `/agency` the same), and admin's Organisations entry lit
on member pages nested under it — screen readers heard two "current" items.

**Why:** a hub route is a prefix of all its children, so the default `activeOptions`
(fuzzy) matches everywhere below it.

**How to apply:** rail/nav links pass `activeOptions={{ exact: true, includeSearch:
false }}` for hub links (portals: `navLinkActiveOptions(to)` / `NAV_HUBS` in
`agency-portal/components/Nav.tsx`; admin: `components/layout/sidebar.tsx`, filed
through `adminNavFilingPath()` in `components/admin/admin-trail.ts`). When a menu
shows the wrong "you are here", measure `[aria-current=page]` live before blaming
the component's own `isActive` — the router may be the one stamping it. Related:
[[locale-prefix-hard-navigation]], [[portal-colour-rule]].
