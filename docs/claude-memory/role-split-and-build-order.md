---
name: role-split-and-build-order
description: "Agreed work split (SL = Outlet+Agency, jk = Admin+PR), the cross-role build order A–H, and the 4 places that split collides"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2767147f-8f41-4a7e-88f8-868be9d52d72
  modified: 2026-07-29T07:50:49.270Z
---

Agreed 2026-07-28: **SL takes Outlet + Agency, jk takes Admin + PR** — the same ownership the BuildSteps tab bylines already carry. This memory holds the build order I recommended and, more importantly, where that split breaks. Complements [[coworker-status-doc]], which tracks progress rather than ownership.

**Build order (phases; items inside a phase can run in parallel):**
- **A — close holes:** `/auth/register` role escalation · `DELETE /payment-voucher/:id` reachable by agency · sub-role guard · *start Twilio/Meta WhatsApp verification day 1, it is the only uncompressible lead time.*
- **B — decide first:** which dispute model wins (`payment_voucher_dispute` vs orphan `dispute`) · who owns `admin_mfa`/`platform_standards` · keep or drop `commission_config`.
- **C — shared foundations:** a scheduler (node-cron) · `notification` table + `notify()`.
- **D — fix data:** drink-menu categories · 5 missing outlet geo pins · Emhub Testing has a shift but no workspace/rates/menu.
- **E — money loop:** write `component` on PV lines → wire `payment_voucher_dispute` + agency resolve UI → PR sign endpoint → payout job + Σ=0 check.
- **F — attendance:** phone sends `{lat,lng,accuracy}` · outlet pin screen · agency live GPS panel.
- **G — PR app:** OCR · self-log pickers · drop `demo-*.ts` · `phone_verification` + OTP routes + register gate.
- **H — rest:** collections/reconciliation · penalty + rating enforcement · auto-assign/sick-cover · MFA + lockout · `getByUserId` agency scope.

**Where the split collides — the four things to agree up front:**
1. `features/payment-voucher/` is one folder split down the middle. Natural seam: `router.use(requireRole('admin','agency'))` in `payment-voucher.routes.ts` — PR `/mine/*` routes sit ABOVE it, agency/admin below. Rule: jk edits above the line, SL below. The controller's `raiseMyDispute` still needs a conversation because it must start writing SL's table.
2. **Migrations on ONE shared DB.** Both would generate `0055_*` and both edit `meta/_journal.json`, where a bad merge silently SKIPS migrations. One person applies at a time and announces; never hand-merge the journal. See [[backend-migrations-shared-db]].
3. Four files both sides touch regardless: `router/v1.ts` · `composition-root.ts` · `middlewares/` (the sub-role guard is SL's feature but admin's territory) · `features/auth/`.
4. **Cross-split blockers:** jk's OCR + drinks picker is blocked on SL fixing drink-menu categories (do this FIRST) · agency payout blocked on whoever builds the scheduler · PR sign-up gate blocked on jk closing register.

Phase C is neither role's — **name an owner** or you get two schedulers and two notification models.

The 3 orphan tables in [[db-audit-live-verified]] may simply BE jk's in-flight work on another branch (`admin_mfa` is exactly the MFA on jk's list). Ask before designing — Phase B item 2 may be a merge, not a decision.

**Re-verified in code 2026-07-28 (do not re-derive):** the register hole is real and is the worst thing in the system — `schema/auth.schema.ts:29` declares `roleId` as a plain client string, `auth.controller.ts:110` parses it from `req.body`, and `:144` passes it straight into `createUserWithRole` with no allow-list; `/auth` mounts at `router/v1.ts:32`, one line ABOVE `authenticateJWT` at `:33`, so the route is unauthenticated. An anonymous caller can mint an admin. Also confirmed: the PV seam is `payment-voucher.routes.ts:25`; `composition-root.ts` is a real 139-line shared registry; `node-cron` is absent from package.json; and `shift-assignment.controller.ts:214-215` puts `rate` + `drinkMenu` in the `/mine` payload — which is why SL's drink-menu categories flow straight into jk's PR app.

**LIVE-DB CORRECTION 2026-07-28 — Phase D is nearly empty, re-verify before planning it.** Queried the real DB: (1) **Emhub Testing is NOT missing its workspace** — it has a workspace row, all 7 tier rates identical to Velvet 23, and 9 menu items; its `base_pay 500` + happy hour 21:00–23:00 is better configured than Bear/Mermate/Onyx/Urban Soul, which still sit at the stale hourly `83.33`. (2) **The drink-menu category claim below is WRONG** — every outlet has a clean split (5–6 `drink`, 2 `service`, 1 `tip`), so jk's OCR + drinks picker are **NOT blocked** and collision point 4 loses its first item. What IS missing: **penalty rules exist only for Velvet 23** (3 rows; all other 5 outlets have 0), and **only Emhub has a geo pin** — the other 5 are unpinned, which per [[outlet-agency-gaps]] means their check-ins are accepted with no location check.

**Two corrections to my own earlier audit:** the 5 NULL `outlet_tier_rate.daily_wage` rows are **NOT a gap** — all five are `kind='commission_only'`, which by design has no daily wage. And the drink-menu problem is worse than "0 tip rows": at 4 of 5 outlets EVERY item is labelled `service`, including Cosmo/Dom Perignon/Donjulio/Ladies drink/Heradura which are drinks. Only Velvet 23 splits correctly (6 drink / 3 service). The Database tab in `InnocenZ_BuildSteps.xlsx` still states the wage claim wrongly and needs that row corrected.

## PR #31 MERGED — `origin/main` is at `b52d2b0` (29 Jul 2026)

24 commits landed on main mid-session: the dispute rewrite, Phase C scheduler + notification, the
notification producers, `pr.reject_reason` (migration **0065**, applied — live max `when`
**1785299538616**), and the locale-prefix fix. **jk will pick up `pr.reject_reason` on his next
pull, and his migrations must land above that timestamp.** `git pull` before branching new work.

## DEFERRED TO PHASE 2 — two features hidden, not deleted (`773973a`)

Both are single switches, commented rather than removed:
- **Agency "Job Posting"** — its entry in `ALL_NAV` (`agency-rbac.ts`) is commented out.
  `canAccessAgencyPath` and the `/agency/special-service` route are **untouched**, so the page
  still renders if reached by direct URL. Uncomment to restore.
- **Outlet "Services" tab** in Post Job (`routes/outlet/bookings.tsx`) — `canOrderServices` is
  forced `false` with the real `outletCan(...)` call kept above it. That one flag already gated
  the tab bar (`showTabs`), the `?tab=services` search param and the services form, so all three
  go together.
  ⚠️ Side effect for phase 2: an outlet sub-role that can order services but cannot post shifts
  (**finance**) now falls into the "no access" branch, since services were its only reason to open
  that page.

## Phase status snapshot — code-verified 2026-07-29 (HEAD bded663)

**DONE:** Phase B closed (see [[phase-b-decisions]]). Phase C shipped `72fc61f` (scheduler + notification, in-app only — mailer/WhatsApp transport still future). Phase E mostly done: `component` on lines, dispute rewrite + agency resolve queue (E2E browser-verified), weekly payout job `b8e06bd`. Phase F mostly done — sooner than planned: CheckInScreen sends `{lat,lng,accuracy}`, backend validates in `shift-assignment/check-in-geofence.ts`, outlet pin UI (GeoFenceCard) exists. Phase A partial: agency-DELETE-PV closed (`canDelete` guard on the route), membership/sub-role escalation fixed `c629d39`. Migrations at 0064.

**OPEN — SL lane:**
- **E:** PR sign endpoint (grep-confirmed absent from `payment-voucher.routes.ts`) · payout Σ=0 check.
- **F:** agency live GPS panel only.
- **D (data, not code):** geo-pin the 5 unpinned outlets (only Emhub pinned; unpinned = check-in passes with no location check) · seed penalty rules for the 5 outlets with none (only Velvet 23 has rows).
- **H:** collections/reconciliation · enforce stored penalty + rating thresholds · sick-cover. ~~outlet swap mid-build~~ **DONE — re-verified 29 Jul: controller + routes + migrations 0052/0053, 3 live rows in `outlet_swap_request`.** ~~`getByUserId` LIMIT-1 multi-agency bug~~ **NOT A BUG — `pr_user_id_unique` makes a second row impossible; see [[roster-live-tab-and-pr-mobile-scoping]].**

**Phase D re-checked 29 Jul and it is BLOCKED ON DATA, not code.** The geocoder works and the pin
UI exists, but the seeded addresses are placeholders — four outlets share "Jalan Hiburan"
(*Entertainment Street*) at different postcodes. Geocoding Bear Lounge returns the **postcode
centroid** at precision `APPROXIMATE`; even Velvet 23 only reaches `RANGE_INTERPOLATED`. Pinning
those would turn today's permissive failure (no location check) into an active one — a 50m fence
around the wrong point rejects every legitimate check-in. **Needs real venue coordinates from the
outlets before anything is written.** Penalty rules are the same shape of problem: only Velvet 23
has any (3 rows), and fine amounts are money policy, not something to infer.

**OPEN — jk lane:** ~~`/auth/register` escalation hole~~ **CLOSED 29 Jul 2026 — see below** · zero Twilio/WhatsApp code, Meta business verification kickoff unconfirmed (**user deferred OTP 29 Jul — do not build it unasked**) · Phase G (OCR, self-log pickers, drop `demo-*.ts`, register gate) · MFA/lockout · live-broken `platform_config`.

## Register escalation CLOSED — 29 Jul 2026 (uncommitted on SL)

**Ownership changed the same day: the SL/jk split is dissolved, the user now owns all four roles.**
That is what made this a one-commit fix — it spans backend + web + mobile.

The server picks the role now. A public caller sends `accountType` (`agency|outlet|pr`, and there is
no `admin` in that enum); `features/auth/signup-roles.ts` maps it to a role NAME and the controller
resolves the id via `roleRepository.getRoleByName`. A client-supplied `roleId` is honoured **only**
when `req.user` resolves to an admin — enabled by a new `optionalAuthenticateJWT` middleware, needed
because `/auth` sits above the JWT guard and plain `authenticateJWT` would 401 every sign-up.

**The non-obvious bits, do not re-derive:**
- Deleting a registered user needs `user_profile` → `user_role` → `user`. Registration writes all
  three; deleting the user first hits `user_profile_user_id_user_id_fk`.
- `apps/web/src/lib/auth/signup-role-ids.ts` is **deleted** — it read `VITE_AGENCY_ROLE_ID` /
  `VITE_OUTLET_ROLE_ID` and *threw* when unset, so signup died there on any env missing them. Those
  two env vars still live in `post-login-redirect.ts` as a roleName fallback — leave them.
- Live-verified against a backend on **7788**, not 7777: a stale server from an earlier session holds
  7777 and answers `/health` with OLD code. Check the port before trusting a green health probe.
- Test script kept at `scratchpad/check-register-escalation.mjs` (4 assertions, self-cleaning). A
  bare `import 'pg'` cannot resolve from the scratchpad — import by absolute path into
  `apps/backend/node_modules`.

**Mobile sign-up is still blocked**, on OTP alone now: `registerPr` sends `accountType:'pr'` and
would succeed, but `/auth/otp/send` + `/auth/otp/verify` still do not exist and the wizard gates on
them. The register half is done; the user deferred the OTP half.

**Recommended next in SL lane:** PR sign endpoint → Σ=0 check (closes Phase E) → then agency GPS panel or resume outlet swap.
