---
name: role-plus-membership-both-required
description: Every portal account needs BOTH a user_role row and an org membership row; the seed scripts each wrote only one half
metadata: 
  node_type: memory
  type: project
  originSessionId: 6176760a-5082-4f1f-bf9b-a98e3d22395c
  modified: 2026-07-20T00:56:12.448Z
---

An InnocenZ account is only usable when it has **both** halves, and the original seed scripts each supplied only one:

- `user_role` row → the web login switches on the role to pick a portal ([login.tsx:106](apps/web/src/routes/login.tsx:106)); missing role falls through to `/no-access`. Backend route guards also check it (`Forbidden — requires one of: admin, agency`).
- `agency_member` / `outlet_member` row → controllers resolve data scope from it (`No agency associated with this account`).

Failures seen, both fixed 2026-07-20:
- Agency orgs had no operator account at all → `seed-agency-owners.ts`.
- Velvet outlet staff (`owner@`/`finance@`/`ops@velvet23.my`) had `outlet_member` rows but `roles: []`, so login landed on `/no-access` → `seed-outlet-roles.ts`.

**Why:** `seed-sample-orgs.ts` writes `user` + `outlet_member` and never `user_role`; `create-test-agency-user.ts` writes the role and never the membership. Neither is wrong on its own — they just don't compose.

**How to apply:** when an account misbehaves, check both halves before assuming the wiring is broken. `GET /auth/me` shows the roles; the members endpoint shows the membership. Critically, an API check with a bearer token can PASS while the UI login still fails — scope comes from the membership, portal routing from the role, so testing only the API hides a missing role. Verify by actually logging in. See [[agency-login-has-no-backend-account]].
