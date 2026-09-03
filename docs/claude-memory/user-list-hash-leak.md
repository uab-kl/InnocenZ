---
name: user-list-hash-leak
description: "FIXED 9a6eecc: GET /user was serving every account's passwordHash to any signed-in role. Where the projection lives and WHY it cannot move to the repository, why outlet must still be allowed to list, and the lesson — reviewing a gate is not reviewing a response body"
metadata: 
  node_type: memory
  type: project
  originSessionId: e6a0525f-ec3a-44a2-bf33-e24471117ad8
  modified: 2026-07-30T09:43:22.490Z
---

**FIXED 30 Jul 2026 in `9a6eecc`** — kept because the two design constraints below are easy to
break, and because the lesson at the bottom is the durable part.

**What it was:** `GET /user?limit=200` returned **200 OK** to *any*
authenticated caller — verified on **pr, outlet AND agency** tokens — carrying the whole user table:
**10 accounts, 10 `passwordHash` values** (the platform admin's included), plus
`failedLoginAttempts` / `lockedUntil` / `blockedReason` and a nested `user_profile` giving
**IC/passport number, DOB, address and ID-photo paths for 6 of the 10**.

**Cause — one line + one missing projection:**
- `apps/backend/src/features/user/user.routes.ts:9` → `router.get('', userController.list…)` with **no
  `requireRole`, no `requireAdmin`, no org scoping**.
- `user.controller.ts` `list()` returns the repository rows **with no projection**, so every column the
  model declares ships — `passwordHash` among them.
- **`PATCH /:id` on the next line is NOT affected** — it checks `actorId !== id` and 403s. Do not
  "fix" that one.

**Why the `41386b9` sweep left it — it was NOT missed, it was mis-rated.**
[[ungated-router-sweep]] recorded `GET /user` as open, named both web callers, correctly separated
the list from the `/user/:id` route mobile actually needs, and prescribed the right remedy
(self-or-privileged scoping). **Then it rated the item MEDIUM.** The rating came from analysing
*who could call* the endpoint and never *what it returned*. An open list of accounts is medium; an
open list shipping `passwordHash` is not. **Reviewing a gate is not reviewing a response body** —
the whole severity lives in the payload, and one `curl` would have found it.

**How it was fixed — TWO constraints that are easy to get wrong. Do not "tidy" either.**

1. **The projection lives in `util/user-profile-image.ts` → `withUserProfile()`, NOT in the
   repository.** `auth` still needs `passwordHash` to verify a login, so moving the strip into the
   query breaks login. Both `list()` and `getById()` funnel through that one helper, so it also
   covers the `/user/:id` route mobile uses. Stripped: `passwordHash`, `failedLoginAttempts`,
   `lockedUntil`, `blockedReason` (zero readers across web + mobile).
2. **The list gate is `requireRole('admin','agency','outlet')` — outlet is IN on purpose.** The
   tighter admin+agency gate that looks obviously right **blanks PR names on two live outlet
   screens**: `use-outlet-today` and `use-outlet-history` resolve display names through
   `services/pr/prs.ts` → `/user`. `/user/:id` is self-or-staff, so mobile's own-profile call still
   works.

**Verified live on all four roles, not assumed:** hash occurrences 0 for admin/agency/outlet, PR 403
on the list and on other users, PR's own record still 200, all four logins still succeed (that is the
check proving the hash still reaches `auth`), 31-check regression sweep clean.

**STILL OPEN — a decision, not a bug.** An outlet listing users still receives the nested
`user_profile`: IC/passport, DOB, address, ID-photo paths. Venues need PR *names*, not identity
documents. Narrowing it is a response-shape change plus a product call — **the same privacy question
as D3** (may a venue see staff coordinates?). Answer both together, see [[client-readiness-verdict]].

**How to apply / the lesson:** the audit's scoreboard had read **"Security / scoping: 0 — all
closed"** since 29 Jul. It was wrong, and **"all closed" only ever meant "all the routers someone
looked at."** A documented exemption is not a verified one — **re-derive exemptions too**, not just
open items ([[audit-entries-are-leads]]). This survived days of clean `tsc` and was found in the
second minute of the first sweep that actually logged in.

Also from that sweep: seeded passwords are weak — PR = `password`, agency/outlet owners =
`Password123!`. All must be gone before any real credential exists
([[client-readiness-verdict]]).
