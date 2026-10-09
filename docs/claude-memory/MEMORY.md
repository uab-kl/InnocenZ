# Memory Index
This index and `docs/claude-memory/` are kept identical in both directions — see [Sync memory mirrors](sync-memory-mirrors.md).
Dated history lives in `TEST_SCRIPT.md` §8/§10; rules live in `CLAUDE.md`.

### Standing rules
- [Database rules](innocenz-database-rules.md) — reuse tables via FK; id-first PK
- [PR under an agency](pr-is-under-an-agency-not-a-member.md) — agency_pr row, not a "member"
- [Test script checks](verify-against-test-script.md) — check changes vs TEST_SCRIPT.md
- [Starter templates](new-outlet-needs-starter-templates.md) — auto-created; never reseed it
- [Seed signature rule](seeds-never-write-a-signature.md) — only the PR's PUT writes it
- [Sync memory mirrors](sync-memory-mirrors.md) — mirrors both ways; not in Excel
- [Confirm every action](innocenz-confirm-every-action.md) — must show server's success line
- [Mobile flexible UI](innocenz-mobile-flexible-ui.md) — any phone; gold=act, red=close
- [Payee name format](innocenz-payee-name-format.md) — nickname in brackets first
- [Button colours](innocenz-portal-button-colours.md) — gold=save/pay; --iz-gold=violet
- [Repo is public](repo-public-is-intentional.md) — deliberate choice, not a bug
- [Warn before migrating](warn-before-adding-a-migration.md) — say so before any migration
- [Typography is enforced](typography-is-enforced-by-a-check.md) — a ratchet; never re-baseline
- [Role grant rule](innocenz-role-grant-rule.md) — granted in exactly 3 places only
- [The Fix Rules](innocenz-the-fix-rules.md) — owner's checklist, every session
- [Shared DB writes](shared-db-writes-need-the-user.md) — scripts AND UI clicks go to the user
- [Never probe with writes](never-probe-a-gate-with-a-write.md) — use a READ, never a write
- [Workbook house style](buildsteps-workbook-house-style.md) — patch XML directly, not ExcelJS
- [Tab order rule](arrange-tabs-most-important-first.md) — most-important tabs go first
- [Video records handoff](marketing-video-records-roles.md) — Excel wins; MDs are handoff
- [DB table conventions](db-table-conventions.md) — never duplicate; reuse via FK
- [Role split, build order](role-split-and-build-order.md) — SL=Outlet+Agency, jk=Admin+PR
- [Coworker status doc](coworker-status-doc.md) — Done/Next/ToDo, in memory only
- [Phase B decisions](phase-b-decisions.md) — dispute table wins over config
- [Phase flags vs perms](phase-flags-vs-permissions.md) — not-offered-yet vs may-not-do
- [Schema reshape backlog](schema-reshape-backlog.md) — done, unapplied, or unspecced
- [Real-app MVP sheet](realapp-mvp-sheet.md) — v4 workbook from the real repo
- [Audit entries are leads](audit-entries-are-leads.md) — re-derive every claim from code
- [Audit update cadence](audit-update-cadence.md) — update it after every change
- [Confirm before asserting](confirm-before-asserting.md) — a read alone isn't evidence
- [Absent evidence](absent-evidence-is-about-the-instrument.md) — a zero result tests the tool
- [Click-through testing](click-through-testing-techniques.md) — how to click-test all 4 roles
- [Probe fixtures](probe-fixtures-must-match-production-shape.md) — must match the prod shape
- [Prove guards live](prove-guards-live-without-writing.md) — test refusals live, leave nothing
- [Check write landed first](write-never-landed-check-first.md) — prove the row exists first
- [Truncate on open](truncate-on-open-destroys-the-file.md) — 'w' mode empties before write fails
- [Backend now allowed](dont-touch-backend.md) — prior no-touch rule lifted
- [Status colours](innocenz-status-colour-code.md) — green=settled, amber=wait, red=dispute
- [KPI formula hidden](kpi-formula-never-displayed.md) — number only; weights in private KPI_WEIGHTS env
- [No account-existence leaks](no-account-existence-leaks.md) — one sign-in/sign-up answer; only a proved phone named
### The money rules
- [PR day-status lifecycle](innocenz-day-status-lifecycle.md) — PENDING→APPROVED→DISPUTED→VERIFIED
- [InnocenZ dispute rule](innocenz-dispute-rule.md) — drinks/tips only, after approval
- [Receipt lifecycle](innocenz-receipt-lifecycle.md) — PENDING→APPROVED→VERIFIED states
- [PV pipeline](innocenz-pv-pipeline.md) — weekly issue, ink-sign, exports
- [Tier rate card](innocenz-tier-rate-card.md) — 7-tier payroll model, per outlet
- [Tier is per-membership](innocenz-tier-is-per-membership.md) — in agency_pr.tier, not hardcoded
- [Zero-count tier is a price](zero-count-tier-is-a-price.md) — 0 requested still needs a rate
- [Self-logged money routing](pr-self-logged-money-goes-to-oldest-agency.md) — resolved from the work itself
- [Billing starts at approval](billing-starts-at-approval.md) — billed at approval, not sign-up
- [Subscription isn't invoice](subscription-record-not-invoice.md) — no payment state; never Paid
- [PV auto-generated weekly](pv-auto-generated-weekly.md) — derived weekly, not hand-authored
- [PV dispute design](pv-dispute-design.md) — one per day, per component
- [Receipt lifecycle spec](receipt-lifecycle-spec.md) — spec answered; not built yet
- [Tips row seeded, locked](tips-row-is-seeded-and-locked.md) — priceable only; category is 'tip'
- [Tier rate stores daily wage](workspace-tier-rate-daily-wage.md) — renamed to daily_wage col
### Payroll and vouchers
- [Agency payroll verify](agency-payroll-verify.md) — most commission lines unproven
- [Collections, two directions](collections-two-directions.md) — one slice hid two money flows
- [Cross-agency penalty window](cross-agency-penalty-window.md) — fixed: window spanned all 4
- [Cross-agency voucher leak](cross-agency-voucher-contamination.md) — money crossed agencies; re-keyed
- [Don't wire sales vs PV](dont-back-outlet-sales-vs-pv.md) — not the outlet's business
- [History read missed sale](history-read-never-opened-shift-sale.md) — fixed: read skipped shift_sale
- [Line rewrite drops columns](line-rewrite-drops-columns.md) — silently drops missing columns
- [Monday-anchored invoice](monday-anchored-collection-invoice.md) — rerun risks double-billing
- [OT not auto-paid](ot-not-auto-paid.md) — needs approval; pay flow unbuilt
- [Overtime bounded by clock](overtime-bounded-by-clocked-time.md) — fixed: bounded by clock-in time
- [Payroll list hid vouchers](payroll-list-hides-real-vouchers.md) — fixed: demo tabs hid real ones
- [PR card Att./Paid live](pr-card-att-paid-live.md) — derived from real attendance rows
- [PR spend excluded commission](pr-spend-excluded-commission.md) — widening broke recon banner
- [Preview/action week mismatch](preview-and-action-must-share-a-window.md) — read different weeks; fixed
- [PV day review](pv-day-review.md) — sign-off; 2 decisions still open
- [PV lane, live verified](pv-lane-live-verified.md) — proven live; rate-card gap remains
- [PV money classification](pv-money-classification.md) — writer+backfill; OT zero past 16h
- [PV signing, Sun-Sat week](pv-signing-lane-and-sun-sat-week.md) — agency can now sign+pay
- [Receipt status omits disputes](receipt-status-cannot-say-disputed.md) — fixed: claims showed settled-green
- [Receipts now feed sales](receipts-dont-feed-outlet-sales.md) — feed shift_sale now, was RM0
- [Voucher duplicate guard](voucher-duplicate-guard-overlap.md) — fixed: matches week OVERLAP now
- [Voucher never checked source](voucher-never-checked-against-source.md) — was blocking: source unchecked
- [Wages pro-rated, cut-loss](wage-is-flat-cutloss-unbuilt.md) — overpay fixed; cut-loss unbuilt
- [Wage line, server sealed](wage-line-is-server-sealed.md) — server writes it; both must sign
- [Write-time guards aren't retro](write-time-guards-are-not-retrospective.md) — checks writes, not history
- [PV detail merge conflict](pv-detail-merge-convergent-fix.md) — two sessions fixed it apart
### Access, scope and identity
- [Org scope guards](innocenz-org-scope-guards.md) — ignoring org isn't a scope check
- [Earlier guard leaked target](refusal-privacy-defeated-by-earlier-guard.md) — a guard 30 lines up named it
- [RBAC portal C/R/U](innocenz-rbac-portal-cru.md) — 3 portals, module_key C/R/U only
- [Accounts, roles and phone](innocenz-account-and-phone-rules.md) — phone_num wins; both guarded
- [Admin pages ungated](admin-pages-not-role-gated.md) — agency token could load admin data
- [Agency read paths ungated](agency-read-paths-ungated.md) — 5 READ routes had no guard
- [IC authority is field-scoped](ic-authority-is-field-scoped.md) — right for dob, wrong for gender
- [Org scope guard family](org-scope-guard-family.md) — must check the id written too
- [OTP channel rules](otp-channel-split.md) — 3 channels; change needs a password
- [PR phone login mismatch](pr-phone-login-mismatch.md) — fixed: phone_num wins now
- [Register discards fields](register-discards-company-fields.md) — signup sends 19, API keeps 7
- [Role + membership both](role-plus-membership-both-required.md) — needs user_role AND membership
- [Sensitive files signed](sensitive-files-signed-links.md) — leave API as 1-hour signed links
- [Ungated router sweep](ungated-router-sweep.md) — 25 routers audited for gates
- [User list hash leak](user-list-hash-leak.md) — fixed: GET /user leaked hashes
- [Web auth guards](innocenz-web-auth-guards.md) — SSR no-op; ssr:false required
- [Web token persistence](web-auth-tokens-not-persisted.md) — persist; failed calls still logout
### Shifts and attendance
- [PR cannot accept/decline](pr-cannot-accept-decline.md) — may only cancel, never decline
- [PR availability built](pr-availability-built.md) — was state that died on unmount
- [Travel gap between shifts](travel-gap-between-shifts.md) — a distance WARNING, not a block
- [Shift overlap rules](shift-overlap-rules.md) — only true overlaps refused
- [Day-cap hid duplicates](day-additive-caps-hide-duplicates.md) — overlaps blocked; travel gap unbuilt
- [MC/leave blocks whole day](mc-leave-blocks-whole-day.md) — approved MC blocks the whole day
- [MC/leave flow](innocenz-mc-leave-flow.md) — no own table; rides shift_assignment
- [Shift day rule](innocenz-shift-day-rule.md) — filed under the day it STARTS
- [Duty status display rule](duty-status-and-checkin-display.md) — attendance beats the shift clock
- [Cross-agency busy rule](innocenz-cross-agency-busy-rule.md) — same day OK, not same time
- [Geofence, live verified](geofence-live-verified.md) — radius+30m; pin can't clear
### Portals: outlet and agency
- [Agency leave approvals tab](agency-leave-approvals-tab.md) — MC/leave now has its own tab
- [Agency login backend gap](agency-login-has-no-backend-account.md) — owner logins exist; roster blank
- [Agency portal wiring](agency-portal-backend-wiring.md) — the whole portal wired to backend
- [Agency portal port](agency-portal-port.md) — ported from InnocenZ-proto
- [AI suggestion auto-assign](ai-suggestion-auto-assign.md) — a real preview→confirm assign
- [Drinks vs services split](drinks-services-split.md) — two price lists, one category
- [Event prices drive money](special-event-prices-drive-money.md) — one resolver per shift for every money path
- [Outlet+Agency gaps](outlet-agency-gaps.md) — a resolve button discards disputes
- [Outlet portal wiring](outlet-portal-backend-wiring.md) — wired to the backend
- [Outlet Post Job, next](outlet-post-job-next.md) — blocked: write-access vs request
- [Post Job → Today/Calendar](outlet-post-job-today-calendar.md) — posts persist; filter rule
- [Outlet shift read access](outlet-shift-read-access.md) — History wired; only TODAY left
- [Outlet swap feature](outlet-swap-feature-build.md) — built & working end-to-end
- [PR referral approval flow](pr-referral-approval-flow.md) — accept writes agency_pr
- [PR sign-up on mobile](pr-signup-mobile.md) — wizard built; no OTP backend yet
- [Roster backend wiring](roster-backend-wiring.md) — PR→shift→assignment→PV chain
- [Roster Live tab scoping](roster-live-tab-and-pr-mobile-scoping.md) — PR shifts scoped to own row
- [Workspace + Ratings merged](workspace-rating-verified-merged.md) — built, verified, merged to main
### The codebase, screen by screen
- [PR mobile backend wiring](pr-mobile-backend-wiring.md) — /mine pattern wires every screen
- [Admin backlog](innocenz-admin-backlog.md) — UI/UX state + per-tab auth pinning
- [Plan change flow](innocenz-plan-change-flow.md) — rules for admin Plan Request
- [PR mobile app](innocenz-pr-mobile-app.md) — mobile port; shifts still demo-only
- [System map](innocenz-system-map.md) — 4 surfaces, one shift/money flow
- [Notification producers](notification-producers.md) — all 6 kinds now have producers
- [Locale-prefix nav](locale-prefix-hard-navigation.md) — use hardNavigate(), never bare paths
### Environment and operations
- [Maps key blocks Places](google-maps-key-places-blocked.md) — geocoder only; 1 match, owner enables Places
- [Zoom + blank screenshots](page-zoom-and-blank-screenshots.md) — skips svh/vw; use chrome-devtools
- [Env gotchas](innocenz-env-gotchas.md) — port 7777, migrate:deploy, GateGuard
- [Running the PR app](innocenz-run-the-pr-app.md) — dev-mobile-web.mjs, port 8081
- [Daily test tracker](innocenz-daily-test-tracker.md) — 4-role run, TEST_SCRIPT-driven
- [R2 buckets](innocenz-r2-buckets.md) — prod vs staging; token-scope traps
- [Deploy blockers](innocenz-deploy-blockers.md) — waits on shared server + iOS
- [App foundation gaps](app-foundation-gaps.md) — no mailer/logout/limits, no tests
- [Backend gap audit](backend-gap-audit-verified.md) — checked against BuildSteps workbook
- [Backend migrations](backend-migrations-shared-db.md) — apply drizzle migrations safely
- [Backend port 7777](backend-port-7777.md) — mismatch broke Post Job writes
- [PR feature renamed](backend-pr-feature-renamed-pr-personnel.md) — features/pr/ is now pr-personnel/
- [Biome scope, mobile style](biome-scope-and-mobile-style.md) — run from apps/web only, not root
- [CI always passed](ci-instruments-that-passed-unconditionally.md) — no-op typecheck, stale drift; fixed
- [Client readiness verdict](client-readiness-verdict.md) — NO general use, YES for a pilot
- [Current state and audit](current-state-and-audit.md) — dated resume point; one job left
- [DB audit, live verified](db-audit-live-verified.md) — 36 tables exist; dispute unwired
- [Green signals that lie](green-signals-that-lie.md) — tsc/drizzle-kit miss live-DB drift
- [Hoisting flip broke types](hoisting-flip-broke-backend-types.md) — dep bump flipped @types hoisting
- [Live role sweep](live-role-sweep-30jul.md) — 4-role method; one bug found
- [Migration journal corrupt](migration-journal-corrupt.md) — generate broken; hand-author
- [Mobile app runs on web](mobile-app-runs-on-web.md) — expo start --web, one script
- [Column needs migration](model-column-without-migration-breaks-login.md) — unmigrated col broke login
- [Nitro chunk cycle](nitro-chunk-cycle-kills-the-server.md) — a green build can still fail
- [Metro watcher wedge](innocenz-metro-watcher-wedge.md) — blank :8081 was a timeout; now 900s
- [Dev environment quirks](innocenz-dev-environment.md) — dev-server + GateGuard quirks
- [Remote DB dependency](innocenz-remote-db.md) — DNS outage looked like bad creds
- [Portal clickthrough method](portal-clickthrough-30jul.md) — click both portals on real logins
- [Production version probe](production-version-probe.md) — use a dated PUBLIC route
- [Root .env leaked NODE_ENV](root-env-node-env-leaks-into-tooling.md) — broke vite build + mobile tests
- [Shared checkout moves](shared-checkout-git-state-moves.md) — tree is shared; status isn't yours
- [Tailwind class glued to ${}](tailwind-class-glued-to-interpolation.md) — dropped from built CSS
- [Tool paths relative to it](tool-paths-are-relative-to-its-root.md) — relative to ITS root, not yours
- [Vite build was dev build](vite-build-was-a-development-build.md) — reads NODE_ENV, not mode
- [Workbook reverification](workbook-reverification.md) — found a DROP-COLUMN landmine
### Past bugs and their lessons
- [Account disable and revoke](accounts-cannot-be-removed.md) — shipped, admin-only, guarded
- [Auto-assign 100-row clamp](auto-assign-100-row-clamp.md) — fixed: clamp truncated 7 cached queries
- [Client guard too strict](client-guard-stricter-than-server.md) — refused work the API allows
- [Dedupe survivor became address](dedupe-survivor-became-an-address.md) — fixed: one row became a fake address
- [Demo data in real sessions](demo-data-leaks-into-real-sessions.md) — derived now, not hand-kept
- [Fix named by symptom](fix-named-by-symptom-hides-siblings.md) — cancel & no-show shared one bug
- [Import cycle killed portal](import-cycle-killed-agency-portal.md) — broke the portal; fixed with leaf module
- [Mirror gate](mirror-gate-plus-silent-mutation.md) — missing gate + swallowed refusal
- [Never round-trip marketing.xlsx](never-round-trip-marketing-xlsx.md) — deleted a sheet + 49 formulas
- [Oldest membership bug](oldest-membership-was-the-agency.md) — fixed: writes landed on wrong agency
- [Outlet panel reads demo data](outlet-panel-reads-demo-slices.md) — mixed real props, empty slices
- [Privacy fix hit one route](outlet-privacy-decision-wired-to-one-route.md) — fixed: hid on /user only, not /pr
- [Outlet read wrong tier](outlet-read-a-foreign-agencys-tier.md) — row scope was right, fact wasn't
- [Owner lane fell to Director](owner-lane-fell-through-to-director.md) — fell back to view-only, fixed
- [Post Job read demo menu](post-job-read-demo-menu-not-backend.md) — read demo menu, not the backend
- [Store roster empty live](store-roster-empty-on-real-session.md) — use the server roster, not the store

### Newly added - file these into a section above

- [Chat side buttons are written](chat-side-buttons-are-written.md) — "Landing chat side buttons (\"I run an agency\"…) are answered by GEMINI as a \"side pick\" whose page path the server guarantees (owner's final call, 3 Oct 2026) — not the written intro"
- [Condensed biome says clean](condensed-biome-says-clean.md) — "The RTK-condensed `npx biome check` output printed \"Lint: No issues found\" while 3 biome errors (formatter + a11y) stood — run it raw with `rtk proxy` before reporting biome clean"
- [Record every enhancement in the book](record-every-enhancement-in-the-book.md) — "Owner wants EVERY enhancement recorded in the InnocenZ_latest Excel book in the same slice — page 1 \"What changed\" line + the area page's rows"

### Newly added - file these into a section above

- [Chat follows the system](chat-follows-the-system.md) — "Landing chat facts are generated from the code (58 tables, RBAC snapshot, menus, TEST_SCRIPT §11) since 5 Oct 2026 — the generator REFUSES until a new table/module/lane has public wording; live rows never go in"
- [Marketing xlsm patch and upload](marketing-xlsm-patch-and-upload.md) — "How to edit marketing-v17-v1-v2.xlsm safely and put it back on Drive as a new version (6 Oct 2026) — style ids renumber on every Sheets save, `$'` in replace() corrupts XML, upload via Chrome Manage versions with an intercepted file input"
- [Marketing xlsm upload every change](marketing-xlsm-upload-every-change.md) — "Owner's standing OK (8 Oct 2026): after EVERY change, upload marketing-v17-v1-v2.xlsm as a new version of the same Drive file in folder 1Ry8q893qlov_ePsY7JjMQX42PUVIs4V1 — no need to ask again"
- [V2 shorts part2 is generated promo](v2-shorts-part2-is-generated-promo.md) — "The V2 Shorts Part 2 'InnocenZ intro animation' is a Genspark-generated promo, NOT a recording of the real app or website; it exists to make people aware of benefits and services InnocenZ really has (owner, 7 Oct 2026)"

### Newly added - file these into a section above

- [Read remote claude session history](read-remote-claude-session-history.md) — "How to read another device's claude.ai/code session (e.g. 'continue memory from session_…'): the local session tools can't see it, but the logged-in Chrome can fetch /v1/code/sessions/<id>/events"
- [V2 shorts prompt style 08oct](v2-shorts-prompt-style-08oct.md) — "Owner's V2 Genspark prompt style as of Thu 8 Oct 2026 — round crown-Z badge in the very top-left, big title top-centre with NO 'POV' label, different Malaysian Chinese girl per PR short, sad English talk-to-camera monologue (selfie vlog + first-person cutaway), Part 2 sad→happy SWITCH, English-only speech and subtitles"
