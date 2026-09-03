---
name: register-discards-company-fields
description: "The web company signup sends 19 fields; /auth/register keeps 7 and silently strips the rest — no agency/outlet row, no owner, no subscription, no consent record"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1c6e4459-6926-4095-9ba5-fa6e81bcf852
  modified: 2026-08-05T03:20:10.859Z
---

Established 5 Aug 2026 by reading the path end to end. **NOT fixed, and DO NOT
start it — as of 5 Aug 2026 a coworker is working on the register part.
Coordinate before touching `/auth/register` or the signup form.**

`apps/web/src/lib/auth/register-api.ts:36` posts 19 fields from the company-shaped
signup form. `RegisterSchema` (`apps/backend/src/schema/auth.schema.ts:25`) declares
7: `email`, `phoneNum`, `username`, `password`, `accountType`, `roleId`,
`verificationId`.

Silently stripped (plain `z.object`, so zod's default is strip-not-reject and the
call still returns **201 Created**): `companyRegistrationOld/New`, `companyAddress`,
`personInCharge`, `contactEmail`, `packageId`, all four ack/T&C booleans, and all
three logo fields. `companyName` survives ONLY because register-api maps it to
`username` at line 39. The logo dies twice over: multer listens for a multipart
field `profileImage` (`auth.routes.ts:53`) while the client sends JSON
`logoBase64`, so `req.file` is always undefined.

**Consequences:** registration creates a `user` + a `user_role` and nothing else.
No `agency`/`outlet` row, no `agency_user` membership, no subscription despite a
paid package being chosen, no stored consent. `POST /agency` creates the org row
only — it never makes the caller its owner. So **there is no UI path to create an
agency owner at all**: the only working routes are
`apps/backend/src/scripts/seed-agency-owners.ts` (hardcoded AGY001–003, requires
the agency row to pre-exist) or an admin calling `POST /agency/:id/members` —
admin bypasses the scope guard at `middlewares/require-sub-role.ts:58`, so the
chicken-and-egg does not bite. `pending_review` does NOT block login
(`features/auth/org-status.ts:17`), so approval is not a prerequisite.
See [[agency-login-has-no-backend-account]].

**Why:** a company-shaped form was pointed at a plain user-signup endpoint, and the
mismatch is invisible because zod discards rather than errors. Same family as
[[pv-detail-merge-convergent-fix]] — *a field with no column behind it fails by
inventing a plausible value, not by going blank.* Here the invented value is
"account created successfully". [[pr-signup-mobile]] records the identical failure
mode on the MOBILE PR wizard's profile fields; this is the web/company half, and
its consequence is larger because an organisation and its owner never come into
existence.

**How to apply:** two traps when this is finally built. (1) The Finance Head signup
path currently WORKS BY ACCIDENT — the invented company is discarded, leaving
exactly the `user` + `agency` role that the agency Settings → Team panel needs
(that panel resolves an email to an existing user and writes only `agency_user`;
it never grants a role). Implement the company half naively and you start minting
a junk agency per staff member, so a "join an existing org" path must land in the
same change. (2) `/auth/register` is PUBLIC (above the JWT guard) and
`POST /agency` is **ungated** — `agency.routes.ts:13` carries no role middleware
while every neighbour does. Widening register to write org rows and gating that
endpoint must land together; see [[pr-signup-mobile]], "it must land WITH the gate,
never before".
