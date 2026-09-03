---
name: pr-signup-mobile
description: "PR sign-up on mobile — built 2026-07-27 as the prototype's 6-step wizard; complete client, no OTP backend, plus the two agreed design decisions for when §4B lands"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-07-27T02:38:08.288Z
---

Built 2026-07-27 on branch SL, **uncommitted**. `apps/mobile/src/screens/SignUpScreen.tsx` mirrors the prototype's `src/routes/register.tsx`: 6 steps (Persona · Address · Agency · Verify · Summary · **OTP last**), `STEP N OF 6` eyebrow, step dots, Previous/Continue footer that becomes `Create account` then `Verify & submit`. Client calls `sendPrOtp` / `verifyPrOtp` / `registerPr` in `lib/api.ts`. Step 4 (ID photos + portfolio) is a deliberate dashed placeholder. See [[otp-channel-split]] for the WhatsApp-vs-email rule.

**Why a missing route shows as "Unauthorized", not 404:** `v1Router.use(authenticateJWT)` (router/v1.ts:32) is the catch-all after the public `/auth` mount, so any unmatched `/api/v1/*` path falls through into the guard and returns **401**. This confused things twice — first for the agency list, then for OTP send. When something 401s, check the route exists before assuming a permissions problem.

**Built and working:** `GET /auth/agencies` (auth.routes.ts) — public by necessity since `GET /agency` sits below the guard. Returns only `{id, name}` for `status:'active'` agencies, reusing the exported `agencyRepository`. Live-verified returning Atlas / Delta / Starline.

**NOT built (user deferred 2026-07-27):** the whole of Build Steps §4B — `phone_verification` table + migration, `otp.service.ts`, `/auth/otp/send`, `/auth/otp/verify`, and the register gate. Sign-up therefore stops at step 5 with a 401. No WhatsApp provider account exists (SMS was dropped entirely — PRs verify by WhatsApp).

**Two decisions agreed for when §4B is built:**
1. **Widen register, one transaction.** Extend `RegisterSchema` to take the profile fields (nationality, idType/idNo, dob, address) plus `agencyId`, and write `user` + `user_profile` + `agency_pr` in a single transaction. Today those fields are collected by the wizard and silently discarded.
2. **It must land WITH the gate, never before.** `POST /auth/register` is unauthenticated AND takes a client-supplied `roleId` (auth.routes.ts + auth.schema.ts:29). Adding an `agency_pr` write first would let an anonymous caller self-link to any agency while choosing their own role. The gate (verified-row check + server-derived PR role) closes it. The mobile client already sends no `roleId`.

**Tooling trap:** `apps/mobile/tsconfig.json` is solution-style (`files: []`, `include: []`) — `tsc -p tsconfig.json` checks **zero files** and always passes. Use `tsc -p tsconfig.app.json`; it has a real ~15-error pre-existing baseline (PhoneSheet, demo-shifts, proof-photo, PaymentScreen, ProfileScreen). The backend's own `tsconfig.json` is fine (`include: ["src/**/*"]`).
