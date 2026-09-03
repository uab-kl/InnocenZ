---
name: dont-touch-backend
description: Backend work is now AUTHORIZED (coworker handed it over 2026-07-16); prior "don't touch" constraint lifted
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 99e51269-5dac-4554-b863-5d6151c58dd4
---

**UPDATE 2026-07-16:** The prior "do not touch `apps/backend`" rule is **lifted**.
The coworker who owned the backend told the user to go ahead and configure it
themselves, as the coworker won't be available for some time. Building/altering
`apps/backend` is now in scope.

**Still be careful (the original risks haven't vanished):**
- **Migrations are the danger zone.** Confirm the target DB is local/personal
  (not a shared DB holding the coworker's data) before running any Drizzle
  migration. Don't clobber un-pushed migrations the coworker may have locally.
- **Match their conventions.** Each feature = `*.model.ts` (Drizzle table in the
  `main` pgSchema + types + Filter), `*.repository.ts` (try/catch + `logger`,
  pagination, filters), `*.controller.ts`, `*.routes.ts` (Express Router + role
  middleware like `requireAdmin`), registered in `apps/backend/src/composition-root.ts`.
- The portal needs operational features the backend lacks: pr/personnel, shift,
  roster, payment-voucher/payout, booking, rating. Design each schema to fit both
  the backend pattern and the portal's `store.ts` shapes. See [[agency-portal-port]].
