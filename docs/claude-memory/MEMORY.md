# Memory Index

All 22 memories, grouped by what they are for. This index and `docs/claude-memory/` in the repo
are kept identical in BOTH directions — see [Sync memory mirrors](sync-memory-mirrors.md).
Dated session history is NOT here: it lives in `TEST_SCRIPT.md` §8/§10. Rules live in `CLAUDE.md`.
The owner's `InnocenZ_BuildSteps.xlsx` is the flow book (flows + where each stops + schema), not a log.

### Standing rules — how to work on this project

- [InnocenZ database rules](innocenz-database-rules.md) — reuse tables, 4 audit columns together, FK-only (no name copies), id-first PKs, UI writes persist + called by primary id; `main.pr` is gone (a PR is a `user`)
- [Verify against test script](verify-against-test-script.md) — check every InnocenZ change against TEST_SCRIPT.md and add new requirements into it
- [Sync memory mirrors](sync-memory-mirrors.md) — mirror this memory to repo docs/claude-memory in BOTH directions + keep CLAUDE.md current; the Excel workbook is the flow book, never a memory tab
- [Confirm every agency action](innocenz-confirm-every-action.md) — approve/edit/save must show the server's own success sentence; silence reads as failure and invites a second, harmful click
- [InnocenZ mobile flexible UI](innocenz-mobile-flexible-ui.md) — sheets/screens flex to any phone; safe-area insets not fixed pixels; no Pressable over ScrollView; gold=act red=close
- [Payee name format](innocenz-payee-name-format.md) — always "(Vicky) Victoria Tan Mei Lin": brackets round the nickname, nickname first, via the one shared formatPayeeLabel

### The money rules — get one wrong and the flow is wrong

- [PR day-status lifecycle](innocenz-day-status-lifecycle.md) — PENDING on check-out → APPROVED (unlocks Dispute) → DISPUTED → VERIFIED only once the agency resolves it
- [InnocenZ dispute rule](innocenz-dispute-rule.md) — drinks/tips only, and only AFTER agency approval; wages + OT are outlet-fixed and never disputable
- [Receipt lifecycle + voucher numbers](innocenz-receipt-lifecycle.md) — PENDING → APPROVED → VERIFIED (0074): only a `manual` self-log starts pending, a pending receipt blocks the send; `voucher_no` = `PV-000001` (0075)
- [InnocenZ PV pipeline](innocenz-pv-pipeline.md) — weekly voucher lifecycle, issue job, drawn-ink PR sign, one-bundle Excel/PDF/print exports + phone ticket links, open queue
- [InnocenZ tier rate card](innocenz-tier-rate-card.md) — 7-tier payroll rate model (base/RM-HR/HH+NH drinks/tips/OT), per-outlet defaults + per-shift override, outlet/agency/PR role boundaries
- [Tier is per-membership](innocenz-tier-is-per-membership.md) — tier lives only in agency_pr.tier and is per-agency; the phone's tier_5 was a hardcoded string, never a database fact

- [A zero-count pay tier is a price, not a quota](zero-count-tier-is-a-price.md) — Post Job discarded a rate typed for a tier with 0 requested; persisting it alone would have made that tier unstaffable (`0 >= 0` reads as full)

### Access, scope and identity

- [Org scope guards](innocenz-org-scope-guards.md) — 🔴 a role guard that never checks the ORGANISATION is not a scope check; also: a zero result is evidence about the instrument, not proof of safety
- [RBAC Portal → Role → Module C/R/U](innocenz-rbac-portal-cru.md) — 3 master portals, specialized roles, module_key + C/R/U only; migrate 0103 + seed/backfill
- [Accounts, roles and the phone number](innocenz-account-and-phone-rules.md) — `user.phone_num` wins over any roster copy; accounts can be disabled and roles revoked, with self-lockout and last-holder guards

### The codebase, screen by screen

- [PR mobile backend wiring](pr-mobile-backend-wiring.md) — apps/mobile PR app page-by-page backend wiring: the /mine endpoint pattern; Shifts, Check-In, Payment/PV, History, exports all wired
- [InnocenZ admin backlog](innocenz-admin-backlog.md) — apps/web admin UI/UX state + per-tab auth pinning (portal-jump fix), env notes for apps/web

### Environment and operations

- [InnocenZ env gotchas](innocenz-env-gotchas.md) — /api/v1 + login shape, port 7777 owned by user's tsx watch, migrate:deploy, pnpm/Defender fix, GateGuard, Excel regen, tsc baselines
- [Running the PR app](innocenz-run-the-pr-app.md) — `node tools/scripts/dev-mobile-web.mjs`, port 8081, backend first; also how to click a nav tab that has no accessible role
- [InnocenZ daily test tracker](innocenz-daily-test-tracker.md) — 4-role daily run-through: TEST_SCRIPT.md is source of truth (Option 2, no automation); Doc regenerated on request
- [InnocenZ R2 buckets](innocenz-r2-buckets.md) — innocenz (prod) vs innocenz-staging (local, empty), the live agency//outlet//user/ key layout, and the token-scope + public-URL traps
- [InnocenZ deploy blockers](innocenz-deploy-blockers.md) — innocenz.net waits on Junyu (shared server) + iOS info; build all upload work against innocenz-staging first
