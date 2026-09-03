---
name: agency-login-has-no-backend-account
description: Agency owner logins now exist (seed-agency-owners); the pr table is still empty so agency roster screens read as blank
metadata: 
  node_type: memory
  type: project
  originSessionId: 6176760a-5082-4f1f-bf9b-a98e3d22395c
  modified: 2026-07-20T00:28:25.652Z
---

RESOLVED 2026-07-20. The shared `innocenz-test` DB has 3 agency orgs (Atlas AGY001, Delta AGY002, Starline AGY003). Originally none had an operator account: an agency-scoped request needs BOTH the `agency` role (route guard) and an `agency_member` row (controller scope resolution), and no user had both — the 10 existing memberships were all `subRole: 'pr'`, and `test-agency@innocenz.dev` had the role but no membership.

Fixed by `apps/backend/src/scripts/seed-agency-owners.ts` (additive + idempotent, matches agencies by agencyCode so existing ids and PR memberships survive). Logins, all password `Password123!`:
`owner@atlas-agency.my`, `owner@delta-agency.my`, `hello@starline.my`.

Two gotchas found while wiring this:
- `user.phone_num` is UNIQUE and agency contact numbers collide with PR seed numbers — claim a phone only if free.
- `GET /agency/memberships` defaulted `subRole` to `'pr'`, which silently filtered out an operator's own owner row, so identity resolution returned empty and the portal fell back to demo. Added `subRole=all` (mirrors the existing `status=all`) and the web now sends it from `fetchAgencyMembershipsForUser`.

**Still blank after this:** the `pr` table itself is empty — `seed-sample-prs` writes user/user_profile/user_role/agency_member but never `pr`. So Manage-PR and the roster read 0 rows even with a correct login. That is a coworker-side seeding gap, not a wiring bug. See [[agency-portal-backend-wiring]], [[roster-backend-wiring]].

Note: the web login intercepts these emails as a client-side DEMO session only when the password is literally `password` — `Password123!` goes to the real backend. Same split as `owner@velvet23.my`.
