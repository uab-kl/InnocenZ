# Memory Index

- [InnocenZ database rules](innocenz-database-rules.md) — standing rules: reuse tables, 4 audit columns together, FK-only (no name copies), id-first PKs, UI writes persist + called by primary id

- [Sync memory mirrors](sync-memory-mirrors.md) — standing rule: mirror this memory to repo docs/claude-memory + CLAUDE.md + the Excel "Claude Code Memory" tab (multi-device user)

- [Verify against test script](verify-against-test-script.md) — standing rule: check every InnocenZ change against TEST_SCRIPT.md and add new requirements into it
- [InnocenZ PV pipeline](innocenz-pv-pipeline.md) — weekly voucher lifecycle, issue job, drawn-ink PR sign, one-bundle Excel/PDF/print exports + phone ticket links, open queue
- [InnocenZ env gotchas](innocenz-env-gotchas.md) — /api/v1 + login shape, port 7777 owned by user's tsx watch, migrate:deploy, pnpm/Defender fix, GateGuard, Excel regen, tsc baselines
- [PR mobile backend wiring](pr-mobile-backend-wiring.md) — apps/mobile PR app page-by-page backend wiring: /mine endpoint pattern; Shifts, Check-In, Payment/PV, History, exports all wired
- [InnocenZ admin backlog](innocenz-admin-backlog.md) — apps/web admin UI/UX state + per-tab auth pinning (portal-jump fix), env notes for apps/web
- [InnocenZ tier rate card](innocenz-tier-rate-card.md) — 7-tier payroll rate model (base/RM-HR/HH+NH drinks/tips/OT), per-outlet defaults + per-shift override, outlet/agency/PR role boundaries
- [InnocenZ daily test tracker](innocenz-daily-test-tracker.md) — 4-role daily run-through: TEST_SCRIPT.md is source of truth (Option 2, no automation); Doc regenerated on request
