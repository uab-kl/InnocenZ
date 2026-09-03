---
name: post-job-read-demo-menu-not-backend
description: Post Job showed Havoc as a drink and no Tips because it read the demo store while Workspace read the backend — the same wrong-source bug hit the same file twice in one week
metadata: 
  node_type: memory
  type: project
  originSessionId: c3e763ca-fdd7-41ed-8713-eb5c1b423117
  modified: 2026-08-05T05:39:46.487Z
---

5 Aug 2026. Outlet **Post Job** read `useStore(s => s.outletWorkspace)` — the **demo** slice — while
the **Workspace** page reads the real `outlet_drink_menu` via `useOutletWorkspace()`. On a
`sessionKind: "real"` login the two screens were reading two different databases: Post Job showed
Havoc under DRINKS and no Tips row; Workspace showed Havoc under Service Entitlement and Tips RM 50.

**Why:** another outlet screen reading the demo store for *data* that a real session deliberately
blanks (see [[demo-data-leaks-into-real-sessions]] and the PR-picker fix in the same file days
earlier). Fixed the same way: the **route** (`routes/outlet/bookings.tsx`) fetches and passes
`workspaceMenu` down as a prop, like `prCandidates` — no new import edge inside the 1,975-line
`post-job-fields.tsx`, which matters given [[import-cycle-killed-agency-portal]]. The store is the
fallback only, for demo sessions.

Also corrected the seed: `DEFAULT_OUTLET_DRINK_MENU` had `havoc` as `category: "drink"` and **no Tips
row**. Saved demo workspaces are repaired in `normalizeOutletWorkspace` **only where the row still
matches the bad seed exactly** — never snap back a row the outlet re-priced or moved itself.

**How to apply:** on any ported outlet/agency screen, `useStore` for *data* is a smell — check whether
a backed hook already exists (`useOutletWorkspace`, `useOutletToday`, `useOutletPrPool`) before
believing what the screen shows. And the lesson that found it: **grouping is a test.** A flat list of
9 rows all labelled SERVICE is unfalsifiable; the moment the same data was split into the two lists
the user already knew, the mismatch announced itself in one glance.
