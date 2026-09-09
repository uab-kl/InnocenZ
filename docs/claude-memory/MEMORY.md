# Memory Index

All 161 memories, grouped by what they are for. This index and `docs/claude-memory/` in the repo
are kept identical in BOTH directions — see [Sync memory mirrors](sync-memory-mirrors.md).
Dated session history is NOT here: it lives in `TEST_SCRIPT.md` §8/§10. Rules live in `CLAUDE.md`.
The owner's `InnocenZ_BuildSteps.xlsx` is the flow book (flows + where each stops + schema), not a log.

### Standing rules — how to work on this project

- [InnocenZ database rules](innocenz-database-rules.md) — reuse tables, 4 audit columns together, FK-only (no name copies), id-first PKs, UI writes persist + called by primary id; `main.pr` is gone (a PR is a `user`)
- [Verify against test script](verify-against-test-script.md) — check every InnocenZ change against TEST_SCRIPT.md and add new requirements into it
- [New outlet starter templates](new-outlet-needs-starter-templates.md) — created automatically at outlet creation; they are the venue's examples to delete, so nothing may re-run the seeding
- [Seeds never write a signature](seeds-never-write-a-signature.md) — `signature_ink` is an attestation the PV sign button pre-loads; only the person's own PUT may write it, and `updated_by` names who touched the ROW, not the field
- [Sync memory mirrors](sync-memory-mirrors.md) — mirror this memory to repo docs/claude-memory in BOTH directions + keep CLAUDE.md current; the Excel workbook is the flow book, never a memory tab
- [Confirm every agency action](innocenz-confirm-every-action.md) — approve/edit/save must show the server's own success sentence; silence reads as failure and invites a second, harmful click
- [InnocenZ mobile flexible UI](innocenz-mobile-flexible-ui.md) — sheets/screens flex to any phone; safe-area insets not fixed pixels; no Pressable over ScrollView; gold=act red=close
- [Payee name format](innocenz-payee-name-format.md) — always "(Vicky) Victoria Tan Mei Lin": brackets round the nickname, nickname first, via the one shared formatPayeeLabel
- [InnocenZ portal button colours](innocenz-portal-button-colours.md) — champagne gold = save/pay, dark soft = secondary, segmented tabs = a choice; `--iz-gold` is violet, never gold

### The money rules — get one wrong and the flow is wrong

- [PR day-status lifecycle](innocenz-day-status-lifecycle.md) — PENDING on check-out → APPROVED (unlocks Dispute) → DISPUTED → VERIFIED only once the agency resolves it
- [InnocenZ dispute rule](innocenz-dispute-rule.md) — drinks/tips only, and only AFTER agency approval; wages + OT are outlet-fixed and never disputable
- [Receipt lifecycle + voucher numbers](innocenz-receipt-lifecycle.md) — PENDING → APPROVED → VERIFIED (0074): only a `manual` self-log starts pending, a pending receipt blocks the send; `voucher_no` = `PV-000001` (0075)
- [InnocenZ PV pipeline](innocenz-pv-pipeline.md) — weekly voucher lifecycle, issue job, drawn-ink PR sign, one-bundle Excel/PDF/print exports + phone ticket links, open queue
- [InnocenZ tier rate card](innocenz-tier-rate-card.md) — 7-tier payroll rate model (base/RM-HR/HH+NH drinks/tips/OT), per-outlet defaults + per-shift override, outlet/agency/PR role boundaries
- [Tier is per-membership](innocenz-tier-is-per-membership.md) — tier lives only in agency_pr.tier and is per-agency; the phone's tier_5 was a hardcoded string, never a database fact
- [A zero-count pay tier is a price, not a quota](zero-count-tier-is-a-price.md) — Post Job discarded a rate typed for a tier with 0 requested; persisting it alone would have made that tier unstaffable (`0 >= 0` reads as full)
- [Self-logged money goes to the oldest agency](pr-self-logged-money-goes-to-oldest-agency.md) — write path FIXED (resolveMoneyAgencyId answers from the WORK); the double-bill risk and the rows already written the old way are the part to watch

### Access, scope and identity

- [Org scope guards](innocenz-org-scope-guards.md) — 🔴 a role guard that never checks the ORGANISATION is not a scope check; also: a zero result is evidence about the instrument, not proof of safety
- [A privacy-worded refusal leaked the rival it hid](refusal-privacy-defeated-by-earlier-guard.md) — the guard 30 lines ABOVE it refused first and named the venue. Harden one refusal, walk every EARLIER one in the same handler. Also: `agencies[0]` on a feed that MERGES all agencies named shifts nobody at that agency booked
- [RBAC Portal → Role → Module C/R/U](innocenz-rbac-portal-cru.md) — 3 master portals, specialized roles, module_key + C/R/U only; migrate 0103 + seed/backfill
- [Accounts, roles and the phone number](innocenz-account-and-phone-rules.md) — `user.phone_num` wins over any roster copy; accounts can be disabled and roles revoked, with self-lockout and last-holder guards

### The codebase, screen by screen

- [PR mobile backend wiring](pr-mobile-backend-wiring.md) — apps/mobile PR app page-by-page backend wiring: the /mine endpoint pattern; Shifts, Check-In, Payment/PV, History, exports all wired
- [InnocenZ admin backlog](innocenz-admin-backlog.md) — apps/web admin UI/UX state + per-tab auth pinning (portal-jump fix), env notes for apps/web

### Environment and operations

- [Page zoom + blank screenshots](page-zoom-and-blank-screenshots.md) — `zoom` scales a whole page but NOT `svh`/`vw`; the Browser pane shoots the landing page blank below the fold, use chrome-devtools
- [InnocenZ env gotchas](innocenz-env-gotchas.md) — /api/v1 + login shape, port 7777 owned by user's tsx watch, migrate:deploy, pnpm/Defender fix, GateGuard, Excel regen, tsc baselines
- [Running the PR app](innocenz-run-the-pr-app.md) — `node tools/scripts/dev-mobile-web.mjs`, port 8081, backend first; also how to click a nav tab that has no accessible role
- [InnocenZ daily test tracker](innocenz-daily-test-tracker.md) — 4-role daily run-through: TEST_SCRIPT.md is source of truth (Option 2, no automation); Doc regenerated on request
- [InnocenZ R2 buckets](innocenz-r2-buckets.md) — innocenz (prod) vs innocenz-staging (local, empty), the live agency//outlet//user/ key layout, and the token-scope + public-URL traps
- [InnocenZ deploy blockers](innocenz-deploy-blockers.md) — innocenz.net waits on Junyu (shared server) + iOS info; build all upload work against innocenz-staging first

### Newly added - file these into a section above

- [Absent evidence is about the instrument](absent-evidence-is-about-the-instrument.md) — "A zero result — no grep hits, no fetch in the file, a SKIP, a green test run — is evidence about the instrument, not about the codebase. Four instances in one session, two published as false claims"
- [Accounts cannot be removed](accounts-cannot-be-removed.md) — "FIXED 30 Jul 2026 (40c9098): PATCH /user/:id/status + DELETE /rbac/user-role, admin-only, with self-lockout and last-holder guards. Read for WHY it was invisible (absent routes), the 4-FK hard-delete recipe, and the MFA-401 trap."
- [Admin pages not role gated](admin-pages-not-role-gated.md) — "Observed 2026-07-20: an agency-role token could load admin pages and read admin data — possible authorization gap, NOT caused by the schema work"
- [Agency leave approvals tab](agency-leave-approvals-tab.md) — PR MC/leave requests now have an MC/Leaves tab on the agency Approvals page (was only a panel buried on the roster)
- [Agency login has no backend account](agency-login-has-no-backend-account.md) — Agency owner logins now exist (seed-agency-owners); the pr table is still empty so agency roster screens read as blank
- [Agency payroll verify](agency-payroll-verify.md) — "Agency payroll verify surface shipped 28 Jul 2026 (0ba5309) — receipts on the voucher detail, and the finding that only 3 of 15 commission lines have any evidence"
- [Agency portal backend wiring](agency-portal-backend-wiring.md) — Campaign to wire the whole Agency portal to the backend (hybrid); audit + per-screen progress
- [Agency portal port](agency-portal-port.md) — How the agency portal was ported from InnocenZ-proto into apps/web and how demo login works
- [Agency read paths ungated](agency-read-paths-ungated.md) — "6 Aug 2026 — the agency router's five READ paths have no guard at all; a PR token reads every agency's SSM/owner contact and any agency's full PR roster with IC numbers. Also: check:drift is blind, and the pr table is gone"
- [Ai suggestion auto assign](ai-suggestion-auto-assign.md) — "Agency home \"AI suggestion\" card rebuilt as a real backend auto-assign (preview→confirm); scope is a one-line switch from today to the whole week; live agency-session check still outstanding"
- [App foundation gaps](app-foundation-gaps.md) — "Cross-cutting production-readiness gaps found 2026-07-27 that the BuildSteps workbook never lists — no mailer, no logout, no rate limiting, no agency_outlet table, no double-booking guard, zero tests"
- [Audit entries are leads](audit-entries-are-leads.md) — "RE-DERIVE every audit entry from the code before acting — including entries that claim something is FINE. Wrong 5 for 5 on 30 Jul 2026: 3 what's-left entries, plus a 'false alarm' verdict and a 'Live' chip that were both reassuring and both wrong. Its tables and phase columns also go stale independently"
- [Audit update cadence](audit-update-cadence.md) — "STANDING INSTRUCTION — update the published audit artifact after EVERY change, not at the end of a session. Includes the republish mechanics that are easy to get wrong."
- [Auto assign 100 row clamp](auto-assign-100-row-clamp.md) — "FIXED 13 Aug 2026 (740c0fc) — a server pageSize clamp silently truncated SEVEN shared-cache-key queries; the SHAPE of the fix is the lesson"
- [Backend gap audit verified](backend-gap-audit-verified.md) — Repo-verified backend + linking gap list (2026-07-27) checked against the 6-tab InnocenZ_BuildSteps workbook — what really exists vs what the workbook claims
- [Backend migrations shared db](backend-migrations-shared-db.md) — "How to safely apply drizzle migrations to the shared innocenz-test Postgres, incl. the timestamp-ordering trap"
- [Backend port 7777](backend-port-7777.md) — Backend runs on 7777 (BACKEND_PORT); frontend VITE_API_URL must be http://localhost:7777/api. Port mismatch was why outlet Post Job wrote no DB row
- [Backend pr feature renamed pr personnel](backend-pr-feature-renamed-pr-personnel.md) — "apps/backend/src/features/pr/ is now features/pr-personnel/ — renamed 6 Aug 2026 by a concurrent session, so every memory and note citing features/pr/* has a stale path"
- [Biome scope and mobile style](biome-scope-and-mobile-style.md) — "Run biome from apps/web ONLY. The repo root errors on the nested config, and apps/mobile has no biome.json — running it there reformats a whole file away from the single-quote style every other mobile file uses"
- [Buildsteps workbook house style](buildsteps-workbook-house-style.md) — "How to edit Downloads/InnocenZ_BuildSteps.xlsx — must patch sheet XML directly (ExcelJS round-trip drops its 6 drawings), plus the exact style indices for each row type"
- [Ci instruments that passed unconditionally](ci-instruments-that-passed-unconditionally.md) — The typecheck target was a no-op echo, check:drift compared against a 60-migration-stale snapshot, and mobile tests never ran — all three fixed 21 Aug 2026
- [Client readiness verdict](client-readiness-verdict.md) — "30 Jul 2026 verdict on shipping to clients: NO for general use, YES for a supervised pilot with 4 named gates. Has the percentage model (55% now / 78% audit-done / 85% pilot), and the scope discovery that the audit is a wiring audit, NOT a launch checklist"
- [Collections two directions](collections-two-directions.md) — "The demo agencyCollections slice hides TWO opposite directions of money behind one name, split by a kind field — which made the audit's repoint instruction wrong. What shipped 30 Jul, both ends, plus lib/collections.ts"
- [Confirm before asserting](confirm-before-asserting.md) — "Four over-calls in one session, all the same error — a count, a truncated page, or a read taken seconds after a write is not evidence yet"
- [Coworker status doc](coworker-status-doc.md) — "External coworker handoff doc (Done/Next/ToDo/Final) for Outlet+Agency backend wiring — kept in memory, not in the repo"
- [Cross agency penalty window](cross-agency-penalty-window.md) — attendanceWindow had no agency_id term, so every weekly penalty judged a PR on all four agencies at once — FIXED 26 Aug 2026 by making agencyId required
- [Cross agency voucher contamination](cross-agency-voucher-contamination.md) — "🔴 A PR in 2+ agencies had one agency's money written onto the other's voucher — the week lookups had NO agency term. Re-keyed in 0129; the index alone would NOT have fixed it."
- [Current state and audit](current-state-and-audit.md) — "START HERE to resume. 31 Jul 2026 (late): HEAD 3f86d2c, 9 unpushed, 12 files UNCOMMITTED in the working tree, nothing pushed by request. All 4 PV decisions ANSWERED, money reconciles 3/3, migration 0077 live. ONE job left: the write-time 400 for line-date-vs-shift. Baselines, house rules, audit URL"
- [Day additive caps hide duplicates](day-additive-caps-hide-duplicates.md) — "An outlet posted the same 11:00-12:00 shift twice and every guard passed — because every guard measured a DAY, and a day's demand is additive. Fixed 17 Aug 2026 — an outlet's shifts may never OVERLAP (409 on create and on a timing edit); back-to-back is allowed because the real rule belongs on the PR who must travel (travel gap: designed, NOT built)"
- [Db audit live verified](db-audit-live-verified.md) — "Live-DB audit 28 Jul 2026 — 36 code tables all exist, 3 orphan tables live with no code, payment_voucher_dispute is 100% unwired, and 3 workbook claims are now wrong"
- [Db table conventions](db-table-conventions.md) — "Schema rules for InnocenZ - never duplicate an existing table, reuse other tables via FK, and every table carries the 4 audit columns"
- [Dedupe survivor became an address](dedupe-survivor-became-an-address.md) — "🟢 FIXED 3 Sep 2026 — a venue named Vicky on a job posted to 2 agencies and only 1 saw the ask. The per-membership design was right; a DISTINCT ON added to fix a display bug left one arbitrary membership standing, and the client used that survivor as the request's ADDRESS"
- [Demo data leaks into real sessions](demo-data-leaks-into-real-sessions.md) — Demo fixtures can render inside a REAL agency/outlet session — root cause was a hand-maintained blank-reset list; now derived from buildDemoStoreReset() keys
- [Dont back outlet sales vs pv](dont-back-outlet-sales-vs-pv.md) — "Never wire outlet-sales-vs-PV-total — the whole payment-voucher router is admin/agency only because agency-to-PR payroll is not the venue's business. It is the fix that LOOKS obvious. What 7baf1ec did instead"
- [Dont touch backend](dont-touch-backend.md) — Backend work is now AUTHORIZED (coworker handed it over 2026-07-16); prior "don't touch" constraint lifted
- [Drinks services split](drinks-services-split.md) — Outlet Workspace now has two separate price lists — Drinks Price vs Service Entitlement — via a category column on the drink menu
- [Duty status and checkin display](duty-status-and-checkin-display.md) — "RULE: attendance stamps beat the shift clock on BOTH portals; check-in is deliberately not time-boxed; check-in renders as local time not raw UTC"
- [Fix named by symptom hides siblings](fix-named-by-symptom-hides-siblings.md) — "The roster's cancel and no-show silently did nothing — the identical bug was already documented three lines above in the same file, missed because that fix was written up as being about swaps rather than about ids"
- [Geofence live verified](geofence-live-verified.md) — "Check-in geofence proven working end-to-end 29 Jul 2026 — Velvet 23 is the live fixture; the real cutoff is radius + up to 30 m, and a pin can never be cleared through the API"
- [Green signals that lie](green-signals-that-lie.md) — "tsc and drizzle-kit generate CANNOT see live-DB drift — they burned us twice in one day. Use `pnpm check:drift`. Also: drizzle 0.45 hides pg error codes in .cause"
- [History read never opened shift sale](history-read-never-opened-shift-sale.md) — "FIXED 27 Aug 2026 — every History money breakdown read RM 0.00 Received because the read side never opened shift_sale, though the receipts were there all along. Services are the MAJORITY bucket (84% of gross), so drinks+tips alone would have been a new wrong number."
- [Hoisting flip broke backend types](hoisting-flip-broke-backend-types.md) — A dependency bump in apps/web silently flipped which @types copy hoists to root and gave apps/backend 42 TS2742 errors
- [Import cycle killed agency portal](import-cycle-killed-agency-portal.md) — "A latent circular import took the whole agency portal down after tsr generate re-ordered route imports — fixed with a leaf module; plus the stale-Vite-HMR trap that made the fix look broken"
- [Line rewrite drops columns](line-rewrite-drops-columns.md) — "RULE — a voucher update REPLACES every line, so any column the HTTP line payload does not carry is silently lost. Cost the PR's proof photos and every receipt link (fixed 7577887). Check this whenever a column is added to payment_voucher_line."
- [Live role sweep 30jul](live-role-sweep-30jul.md) — "HOW to run a real 4-role sweep (working credentials, backend start, route list) and what the first one found on 30 Jul 2026 — one critical bug, plus 4 audit claims corrected in both directions"
- [Locale prefix hard navigation](locale-prefix-hard-navigation.md) — "The web app is locale-prefixed (/en/...) — every full-page navigation must go through hardNavigate(), never window.location.assign with a bare path"
- [Mc leave blocks whole day](mc-leave-blocks-whole-day.md) — An approved MC now writes a pr_availability day-block for every agency; it used to excuse one shift and leave the freed hours bookable
- [Migration journal corrupt](migration-journal-corrupt.md) — "⚠️ BROKEN AGAIN as of 3 Aug 2026 — `drizzle-kit generate` CANNOT RUN (17 migrations have no valid snapshot). Hand-author every migration; `migrate` still works. The 28-29 Jul repairs are kept below for their recipes."
- [Mirror gate plus silent mutation](mirror-gate-plus-silent-mutation.md) — A dead button = a client gate missing a server term AND a mutate() that swallows the refusal. Check both; neither alone explains "nothing happens".
- [Mobile app runs on web](mobile-app-runs-on-web.md) — "HOW TO RUN THE PR APP — expo start --web via tools/scripts/dev-mobile-web.mjs (or the mobile-web launch entry). Ends the 'nothing in apps/mobile has ever been run' era; it bundles clean and found a blocking bug in its first minute."
- [Model column without migration breaks login](model-column-without-migration-breaks-login.md) — "Adding a column to a Drizzle model without running its migration breaks EVERY query on that table — on `user` that means all four roles cannot log in"
- [Monday anchored collection invoice](monday-anchored-collection-invoice.md) — One SETTLED collection_invoice row is Monday-anchored (20–26 Jul) — re-running the weekly job for either overlapping Sun–Sat week can double-bill Velvet 23
- [Nitro chunk cycle kills the server](nitro-chunk-cycle-kills-the-server.md) — A green `nx build` does not mean the server runs — nitro splits one vite chunk into two that import each other
- [Notification producers](notification-producers.md) — "All 6 notification kinds now have producers — who fires each, who receives it, and the non-obvious triggers (OT = the check-out clamp; join decision = pr.status)"
- [Oldest membership was the agency](oldest-membership-was-the-agency.md) — "🟢 FIXED 13 Aug 2026 — a PR's agency was resolved as their OLDEST agency_pr row, so the 2 multi-roster PRs of 32 could not be edited at all (404), and an admin's writes landed on the wrong agency. Carries: a symptom named after 3 fields was about none of them"
- [Org scope guard family](org-scope-guard-family.md) — "A role guard that never compares against the id being written is not a scope check — two cross-tenant write holes closed 4 Aug, plus member management widened to org owners"
- [Ot not auto paid](ot-not-auto-paid.md) — Overtime is no longer auto-sealed onto a voucher at check-out — it renders as pending agency approval. The approve/pay flow does not exist yet.
- [Otp channel split](otp-channel-split.md) — Product rule set 2026-07-27 — Agency + Outlet verify by EMAIL OTP; PRs verify by WHATSAPP OTP (SMS dropped entirely)
- [Outlet agency gaps](outlet-agency-gaps.md) — "Portal-specific remaining gaps for Outlet + Agency, repo-verified 2026-07-27 — incl. the dispute 'resolve' button that silently discards a PR's dispute"
- [Outlet panel reads demo slices](outlet-panel-reads-demo-slices.md) — "Zustand demo data retired (store boots blank, prComcard kept); and the outlet Today panel renders cards from BACKEND props while resolving everything else from empty DEMO slices — 3 buttons fixed, shift-history rows still open"
- [Outlet portal backend wiring](outlet-portal-backend-wiring.md) — Campaign to wire the Outlet portal to the backend (bucket-A); audit + per-screen progress
- [Outlet post job next](outlet-post-job-next.md) — "Next task: wire outlet Post Job. Blocked on an undecided product call — outlet write access vs a request flow"
- [Outlet post job today calendar](outlet-post-job-today-calendar.md) — Outlet Post Job → shift flow is DONE & verified; outlet posts now persist as confirmed (2814d91). How Today vs Calendar filter shifts. Pending user restart + optional backfill
- [Outlet privacy decision wired to one route](outlet-privacy-decision-wired-to-one-route.md) — "FIXED 3 Sept 2026 — the owner decision hiding PR identity docs from outlets was middleware wired to /user and nothing else, so /pr shipped icNo + dob and /shift-assignment shipped cancel fees and GPS. Carries the two-sided proof a privacy fix needs"
- [Outlet read a foreign agencys tier](outlet-read-a-foreign-agencys-tier.md) — "A scope filter narrowed the ROWS but not the FACT — GET /pr for an outlet caller returned a PR once per agency_pr membership, so the web's id-keyed map kept a tier from an agency that never supplied that night (Vicky: Tier I instead of Tier III)"
- [Outlet shift read access](outlet-shift-read-access.md) — "Outlet History fully wired & live-verified; outlet shift + shift-assignment read access done. Only outlet TODAY remains (big job)"
- [Outlet swap feature build](outlet-swap-feature-build.md) — "Outlet swap is BUILT AND WORKING end-to-end (backend + agency web + PR mobile), live-verified on branch SL; nothing committed"
- [Overtime bounded by clocked time](overtime-bounded-by-clocked-time.md) — "Overtime was measured from the scheduled end and never consulted check-in, billing hours the PR was absent for — now bounded by time actually clocked in"
- [Owner lane fell through to director](owner-lane-fell-through-to-director.md) — "Every outlet AND agency OWNER resolved as a view-only Director — the lane map never named `owner`, it relied on a fallback that had since been changed to least privilege"
- [Payroll list hides real vouchers](payroll-list-hides-real-vouchers.md) — "FIXED 30 Jul 2026 (9966b4f) — the agency Payroll list showed 0 of 4 real vouchers because demo week tabs start Sunday and the backend's week_start is Monday. Owner kept Sunday tabs + added This Week; matching is by CONTAINMENT, and each row prints its own week."
- [Phase b decisions](phase-b-decisions.md) — "Phase B is CLOSED — the three decisions and their evidence: dispute table wins, admin_mfa/platform_standards are jk's, commission_config dropped"
- [Phase flags vs permissions](phase-flags-vs-permissions.md) — A phase flag means the product is not offering this yet; a *Can() check means this role may not do it. Conflating them tells someone their role is broken when it is fine. lib/phase-flags.ts is the one home
- [Portal clickthrough 30jul](portal-clickthrough-30jul.md) — "HOW to click both web portals through on real password logins (the step that was blocked for days) and what the first pass found 30 Jul 2026 — everything held, one label bug fell out on sight, and the draft-invisibility proof"
- [Post job read demo menu not backend](post-job-read-demo-menu-not-backend.md) — Post Job showed Havoc as a drink and no Tips because it read the demo store while Workspace read the backend — the same wrong-source bug hit the same file twice in one week
- [Pr availability built](pr-availability-built.md) — "🟢 BUILT 13 Aug 2026 — a PR's 'not available' day was React state that died on unmount; now main.pr_availability (0121), and the assign lane 409s on it. Carries: a UI-only feature can look complete from the screen"
- [Pr cannot accept decline](pr-cannot-accept-decline.md) — Domain rule — PRs never accept/decline shift assignments; they can only cancel per cancellation rules
- [Pr card att paid live](pr-card-att-paid-live.md) — "Agency PR card's Att./Paid now derived from real rows (commit 74a6d96) — and why the owner's own screen still reads an em-dash and RM 0"
- [Pr phone login mismatch](pr-phone-login-mismatch.md) — "ANSWERED + FIXED 30 Jul 2026 (e936030): user.phone_num WINS. Reads resolve through the FK, login matches on digits. The DROP COLUMN is deliberately deferred — 3 live readers. Read before touching pr.phone or the login lookup."
- [Pr referral approval flow](pr-referral-approval-flow.md) — "Product rule set 2026-07-27 — PR sign-ups show as Referred / Not referred on the agency approval page; Accept writes agency_pr, Decline notifies the PR to find another agency"
- [Pr signup mobile](pr-signup-mobile.md) — "PR sign-up on mobile — built 2026-07-27 as the prototype's 6-step wizard; complete client, no OTP backend, plus the two agreed design decisions for when §4B lands"
- [Pr spend excluded commission](pr-spend-excluded-commission.md) — "The outlet's PR spend showed wages only under a label reading 'PR wages & commission' — and the obvious fix (widen totalCost) would have broken the reconciliation banner, because collection_invoice bills pay_amount alone"
- [Preview and action must share a window](preview-and-action-must-share-a-window.md) — "🟢 FIXED 20 Aug 2026 — the Payroll penalty PREVIEW and the button that charges it computed the same fact from DIFFERENT weeks, so on any closed week the fines Record would seal were never listed. The only symptom was a UX complaint: 'I have to press it just to see them'."
- [Probe fixtures must match production shape](probe-fixtures-must-match-production-shape.md) — "A probe that writes its own fixtures must write them in the PRODUCTION shape or it certifies the bug; plus the two join facts it hid — shift_assignment.pr_id IS user_id, and one person holds an agency_pr row PER AGENCY"
- [Prove guards live without writing](prove-guards-live-without-writing.md) — "How to fire refusals, races and unreachable branches against the SHARED database while leaving nothing behind — the four techniques that took the overtime lane from unit-proven to live-proven on 2 Aug 2026"
- [Pv auto generated weekly](pv-auto-generated-weekly.md) — "Payment vouchers are auto-generated weekly by the app for PRs — derived, not manually authored"
- [Pv day review](pv-day-review.md) — "Agency day-by-day PV sign-off (ef45445 / migration 0072) — the 3 design rules that make it mean anything, what is live-verified, and the 2 owner decisions + frontend still open"
- [Pv detail merge convergent fix](pv-detail-merge-convergent-fix.md) — "The one merge conflict with main (PR #36): jk and I fixed the same mobile PV receipts bug independently. Why the resolution kept jk's structure but overrode its ref/matched, and the rule that generalises the four claims-more-than-its-data bugs"
- [Pv dispute design](pv-dispute-design.md) — "Payment-voucher dispute model agreed 2026-07-27 — one dispute per day PER COMPONENT (wages / drinks / tips), proof mandatory, receipts referenced by receipt_no not line id"
- [Pv lane live verified](pv-lane-live-verified.md) — "3 Aug 2026 — the PV lane is rendered and arithmetically proven live; HEAD 37bab63, 4 unpushed. Carries the rate-card gap the audit cannot see, and three mistakes I made reading evidence."
- [Pv money classification](pv-money-classification.md) — "PV line component writer + backfill, and the overtime bug it exposed (28 Jul 2026) — how lines get classified, and why OT now returns 0 past 16h"
- [Pv signing lane and sun sat week](pv-signing-lane-and-sun-sat-week.md) — "3 Aug 2026 — the payroll week is now Sun-Sat everywhere, the agency can finally SIGN and PAY, and the PR's History shows closed weeks. Carries the one mistake I made three times in a day: widening a query invalidates every consumer that inferred a fact from its old narrowness."
- [Realapp mvp sheet](realapp-mvp-sheet.md) — A real-app MVP spec workbook (v4) was generated from the actual monorepo; captures the honest current architecture status
- [Receipt lifecycle spec](receipt-lifecycle-spec.md) — "Owner's receipt PENDING→APPROVED→VERIFIED spec (30 Jul 2026) with all 3 decisions ANSWERED — do not re-ask. Prerequisite shipped (7577887); the feature itself is NOT built. Includes what to build and the traps."
- [Receipt status cannot say disputed](receipt-status-cannot-say-disputed.md) — "receipt.status is the AGENCY's review only, so an open PR claim rendered settled-green on three surfaces; the feed now carries disputes[] and an open claim OWNS the tag"
- [Receipts dont feed outlet sales](receipts-dont-feed-outlet-sales.md) — "BUILT AND VERIFIED 10 Aug 2026 — PR receipts now feed shift_sale, so outlet floor sales is no longer always RM 0.00. Services have their own service_sales_rm bucket (0109). Carries the recompute-not-increment rule and the category-vs-kind trap."
- [Register discards company fields](register-discards-company-fields.md) — "The web company signup sends 19 fields; /auth/register keeps 7 and silently strips the rest — no agency/outlet row, no owner, no subscription, no consent record"
- [Role plus membership both required](role-plus-membership-both-required.md) — Every portal account needs BOTH a user_role row and an org membership row; the seed scripts each wrote only one half
- [Role split and build order](role-split-and-build-order.md) — "Agreed work split (SL = Outlet+Agency, jk = Admin+PR), the cross-role build order A–H, and the 4 places that split collides"
- [Root env node env leaks into tooling](root-env-node-env-leaks-into-tooling.md) — One line — NODE_ENV=development in the repo-root .env — silently broke the vite production build AND the mobile jest suite
- [Roster backend wiring](roster-backend-wiring.md) — Progress + resume point for wiring the agency roster UI to the backend (PR→shift→assignment→weekly PV chain)
- [Roster live tab and pr mobile scoping](roster-live-tab-and-pr-mobile-scoping.md) — "Agency Roster Live tab now reads the backend (not demo store); PR mobile shifts are scoped by logged-in user's pr row"
- [Schema reshape backlog](schema-reshape-backlog.md) — "Ordered backlog of the InnocenZ table reshape — what is done, what is unapplied, and the spec for the tables not started yet"
- [Shared checkout git state moves](shared-checkout-git-state-moves.md) — "This working tree is shared with other agent sessions — files get auto-staged and directories move mid-task, so git status is not all yours; plus TEST_SCRIPT.md is committed CRLF, so any edit to it shows a 9,000-line whole-file diff unless you use -c core.autocrlf=false"
- [Shift overlap rules](shift-overlap-rules.md) — A PR MAY work several shifts a day — only OVERLAPS are refused. Both guards now compare on a continuous timeline because the old same-date test never caught overnight-into-next-morning
- [Subscription record not invoice](subscription-record-not-invoice.md) — "member_subscription has NO payment state — it is a who-subscribed-and-when ledger, so no screen may badge a row Paid. Both portals were doing it; shared lib/subscription-record.ts now stops them drifting"
- [Tailwind class glued to interpolation](tailwind-class-glued-to-interpolation.md) — "In apps/web, a Tailwind arbitrary-value class written immediately before ${...} in a className template literal is silently dropped from the built CSS"
- [Tool paths are relative to its root](tool-paths-are-relative-to-its-root.md) — A build tool prints paths relative to ITS root, not yours — I read the wrong node_modules copy and called a real duplicate a "rolldown bug"
- [Travel gap between shifts](travel-gap-between-shifts.md) — "A PR could be booked 11:00-12:00 at one venue and 12:01-13:01 at another across KL — the assign guard tested overlap only, and nothing measured the space BETWEEN two shifts. Built 17 Aug 2026 as a distance-derived WARNING, not a refusal"
- [Ungated router sweep](ungated-router-sweep.md) — "Full audit of all 25 backend routers for missing role gates (28 Jul 2026) — what was fixed, what is still open, and who owns each remainder"
- [User list hash leak](user-list-hash-leak.md) — "FIXED 9a6eecc: GET /user was serving every account's passwordHash to any signed-in role. Where the projection lives and WHY it cannot move to the repository, why outlet must still be allowed to list, and the lesson — reviewing a gate is not reviewing a response body"
- [Vite build was a development build](vite-build-was-a-development-build.md) — Every `vite build` in apps/web was silently a DEVELOPMENT build — Vite reads isProduction from NODE_ENV, not from mode
- [Voucher duplicate guard overlap](voucher-duplicate-guard-overlap.md) — "A PR was billed twice for one shift; the guard now matches week OVERLAP not week_start equality — and the 'anchor bug' was a stale backend process, not code"
- [Voucher never checked against source](voucher-never-checked-against-source.md) — "🔴 BLOCKING (31 Jul 2026): the money is WRONG. A week worth RM703.60 produced two vouchers totalling RM2,285.08, and the correct one is the one still unsent. Wages for an unworked day, 113h OT on a 6h slot, a line 6 weeks out of range, one drink paid twice. Nothing compares a voucher to its source records"
- [Wage is flat cutloss unbuilt](wage-is-flat-cutloss-unbuilt.md) — "Wages are now PRO-RATED by minutes worked (0097, shipped 6 Aug) — the flat seal that overpaid an early check-out is fixed; penalty + cut-loss remain unbuilt"
- [Web auth tokens not persisted](web-auth-tokens-not-persisted.md) — "Tokens ARE persisted to localStorage; a failed API call wipes them via kickToLogin — so a browser click-through needs the backend running, or you get bounced to /login"
- [Workbook reverification](workbook-reverification.md) — "Re-verification of InnocenZ_BuildSteps.xlsx against the live DB + repo on 28 Jul 2026 — which claims drifted, which held, and the DROP-COLUMN landmine it uncovered"
- [Workspace rating verified merged](workspace-rating-verified-merged.md) — "Outlet Workspace + Ratings built, live-verified, and merged to main; open follow-ups"
- [Workspace tier rate daily wage](workspace-tier-rate-daily-wage.md) — outlet_tier_rate now stores DAILY wage in a renamed daily_wage col; migration 0047 APPLIED (rename+backfill+outlet_id); daily-wage bug fixed
- [Write never landed check first](write-never-landed-check-first.md) — "31 Jul 2026: 'the PR added a receipt / raised a dispute and the agency cannot see it' — BOTH writes never reached the shared DB. Before debugging any PR→Agency visibility report, prove the row exists. Includes the live snapshot, the mobile API-URL resolution, and the two schema column names probes keep getting wrong"

### Newly added - file these into a section above

- [Client guard stricter than server](client-guard-stricter-than-server.md) — "A client-side filter STRICTER than the server's refuses work the API would accept — and agency-scoped reads make it asymmetric, so the same person is offered at one agency and invisible at the other; found 3 Sep 2026 in auto-assign, whose busy rule was a DAY while the server's was a WINDOW"
- [Innocenz cross agency busy rule](innocenz-cross-agency-busy-rule.md) — "Many agencies may book one PR on the same DAY but never overlapping TIMES; busy state is shown as times only — never which agency/venue; warn, don't block"
- [Innocenz dev environment](innocenz-dev-environment.md) — InnocenZ dev-server/env quirks and ECC GateGuard hooks that shape how to work in this repo
- [Innocenz mc leave flow](innocenz-mc-leave-flow.md) — MC/leave has no table of its own — it rides shift_assignment (status enum + notes + leave_proof_photos jsonb)
- [Innocenz metro watcher wedge](innocenz-metro-watcher-wedge.md) — Blank localhost:8081 root cause — Metro watcher 240s startup timeout on Windows under dev:all load; patched to 900s; corrupt-cache guard in dev scripts
- [Innocenz plan change flow](innocenz-plan-change-flow.md) — Business rules the user specified for the admin Plan Request / Plan Change pages (July 2026)
- [Innocenz pr mobile app](innocenz-pr-mobile-app.md) — apps/mobile is the PR app (port of InnocenZ-proto /host view); demo login +60123456789/password; shift data still demo-only
- [Innocenz remote db](innocenz-remote-db.md) — "Backend depends on remote Postgres postgres.gremoryyx.com:6543/innocenz-test; DNS for that host vanished 2026-07-29, and DB outages masquerade as \"Invalid credentials\""
- [Innocenz shift day rule](innocenz-shift-day-rule.md) — "A shift belongs to the day its START time falls on — an overnight shift is filed under the day it began, never the day it ends"
- [Innocenz status colour code](innocenz-status-colour-code.md) — "Owner's platform-wide colour code for money/review status — green settled, amber waiting (pending AND approved), white mixed, red disputed/deducted; applies to PR app, agency receipts, and PVs"
- [Innocenz system map](innocenz-system-map.md) — "The four InnocenZ surfaces (PR mobile, Agency web, Outlet web, Admin web) and the end-to-end shift/money workflow connecting them"
- [Innocenz web auth guards](innocenz-web-auth-guards.md) — "How InnocenZ web route guards actually execute (SSR no-op, ssr:false requirement, role guard design, react-query hidden-tab retry pause)"

### Newly added - file these into a section above

- [Ic authority is field scoped](ic-authority-is-field-scoped.md) — "A rule load-bearing for one field is not automatically true of the next it touches — 'the IC wins' is right for dob (the digits ARE the date) and wrong for gender on demo ICs"

### Newly added - file these into a section above

- [Typography is enforced by a check](typography-is-enforced-by-a-check.md) — "STANDING RULE (owner, 8 Sep 2026) — run `pnpm check:type` on portal work; it is a ratchet over 1,004 known raw values, never re-baseline to hide a new breach"
- [Warn before adding a migration](warn-before-adding-a-migration.md) — "STANDING RULE (owner, 8 Sep 2026) — say so and wait before adding any database migration; never slip one into a larger change"
