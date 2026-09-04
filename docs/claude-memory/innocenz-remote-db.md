---
name: innocenz-remote-db
description: "Backend depends on remote Postgres postgres.gremoryyx.com:6543/innocenz-test; DNS for that host vanished 2026-07-29, and DB outages masquerade as \"Invalid credentials\""
metadata: 
  node_type: memory
  type: project
  originSessionId: ed0f5a53-d0d8-4677-a552-b97c5bf0d10f
  modified: 2026-07-29T13:56:10.854Z
---

The backend (root `.env`) points at a remote shared Postgres: `postgres.gremoryyx.com:6543`, db `innocenz-test`. On 2026-07-29 the `postgres.` subdomain stopped resolving (NXDOMAIN on Google DNS and router; parent `gremoryyx.com` still resolves), so every login on web + mobile returned 401 "Invalid credentials".

**Why:** `getUserByLoginMethod` in `apps/backend/src/features/user/user.repository.ts` swallows connection errors and returns null, so the auth controller reports invalid credentials instead of a 500. Diagnose DB reachability first (`Test-NetConnection postgres.gremoryyx.com -Port 6543`) before trusting auth error messages.

**How to apply:** If logins mysteriously fail across all apps, check DB connectivity before credentials. Backend must be restarted after `.env` changes (dev-all reuses a running backend on 7777, old env sticks). See [[innocenz-dev-environment]].

**Resolved 2026-07-29:** `.env` now uses the server IP directly (`POSTGRES_HOST=103.224.93.109`, port 6543, reachable). Web login verified working (user's own account + DEFAULT_ADMIN innocenz@gmail.com). The DNS name is still dead — keep the IP. Note: the Vicky demo PR (60123456789/password from seed-sample-prs) does NOT exist in innocenz-test — the PR seed was never run there; mobile logins need a registered PR account or a seed run.

**Second masking path, fixed 2026-07-29 (branch claude/distracted-sutherland-8e4931):** `getRolesForUserIds` in `auth.repository.ts` returned `[]` on DB errors, so `requireRole`/`requireAdmin` turned remote-DB blips into intermittent 403 "Forbidden — requires one of: admin" for genuine admins (admin Plan Request / Job Postings pages). Fix: repository rethrows, `require-role.ts` gained a 30s per-user role cache with ≤10min stale fallback (cold DB failure → 500, never false 403), and `db/index.ts` pool got max 20 / keepAlive / 10s connect timeout. Account gotcha: `jinkgan48@gmail.com` (username "jk") is admin; `jk@house.test` (JK House Owner) is outlet-only — a 403 on the latter in /admin is correct behavior, not this bug.
