---
name: app-foundation-gaps
description: "Cross-cutting production-readiness gaps found 2026-07-27 that the BuildSteps workbook never lists — no mailer, no logout, no rate limiting, no agency_outlet table, no double-booking guard, zero tests"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-07-27T01:34:29.183Z
---

Verified in `apps/backend` on **2026-07-27** (branch SL). These are *foundations*, not features — none appear anywhere in the workbook, which only tracks feature work. Companion to [[backend-gap-audit-verified]] (backend-vs-workbook) and [[outlet-agency-gaps]] (portal-specific).

**No transactional message channel exists at all.** `forgotPassword` mints a token then just `logger.info('Reset link generated:', resetUrl)` (auth.controller.ts:211) — there is no nodemailer/resend/sendgrid in `package.json`. So password reset is non-functional in production, and team invites, PV-ready alerts, dispute notices and the Part-9 OTP all have no delivery mechanism. **One integration unblocks ~8 features across both portals — treat it as the top foundation item.**

**Sessions cannot be ended.** No logout endpoint, no refresh-token revocation/blacklist (grep = 0 in `features/auth` + `features/jwt`). Login *does* correctly reject `user.status !== 'active'`, so the front door is guarded, but suspending an org or removing a member via `DELETE /outlet/:id/members/:memberId` does not invalidate an existing JWT.

**No rate limiting anywhere** — no `express-rate-limit`, nothing custom. `/auth/login` is brute-forceable; `/auth/forgot-password` is an unauthenticated token generator. Note for the OTP build: its rate limits would be the FIRST in the system, so there is no pattern to copy.

**Agency↔outlet is barely modelled — schema decision needed before more screens land.** There is no `agency_outlet` table. The only link is the nullable FK `outlet.onboarded_by_agency_id` (outlet.model.ts:29) meaning "who signed them up", not "who staffs them" — and it is applied as a *client-supplied query filter* (`req.query.onboardedByAgencyId`), not server-enforced scoping, so the agency portal can enumerate every outlet by omitting the param (`use-agency-outlets.ts` calls the generic `fetchOutlets`). Blocks: one outlet served by two agencies, "my venues" before onboarding, per-pair commission terms.

**No double-booking guard** — zero clash/overlap/conflict checks in `shift-assignment`. Same PR assignable to two venues the same night → two PVs for the same hours, and no Σ=0 audit downstream to catch it.

**Zero automated tests** in `apps/backend` and `apps/web` (no `*.test.ts` / `*.spec.ts`). Highest real-usage risk given the app's core job is computing wages.

**Genuinely solid, don't re-audit:** audit logging on every write (`platformAuditMiddleware`), bcrypt + JWT access/refresh, helmet + cors, zod at boundaries, active-status check on login, real pagination (`pageSize`) on shift + pr repositories.

**Open product question:** outlet + agency portals are web-only, but the users are floor/ops staff in a venue at 1am. Decide explicitly rather than by default — it changes how the Today/live-ops surfaces get built.
