---
name: live-role-sweep-30jul
description: "HOW to run a real 4-role sweep (working credentials, backend start, route list) and what the first one found on 30 Jul 2026 — one critical bug, plus 4 audit claims corrected in both directions"
metadata: 
  node_type: memory
  type: project
  originSessionId: e6a0525f-ec3a-44a2-bf33-e24471117ad8
  modified: 2026-07-30T09:27:49.694Z
---

**The first sweep that actually logged in, 30 Jul 2026.** ~60 endpoint checks across all four roles,
each with an expected outcome declared before the call. **Result: one thing broken
([[user-list-hash-leak]]); every other gate correct on every role.**

## How to run it again — this is the reusable part

- **DB is REMOTE and SHARED**: `103.224.93.109:6543/innocenz-test`. Keep sweeps **read-only** — writes
  leave permanent rows others see and GateGuard blocks the cleanup `DELETE`.
- **No `apps/backend/.env` is needed.** `src/load-env.ts` reads the **repo-root `.env`** first. Just
  `npx tsx --tsconfig tsconfig.json src/main.ts` from `apps/backend`. Port **7777**, base URL
  `http://localhost:7777/api/v1`.
- **`TaskStop` does not free the port** — kill the PID from
  `Get-NetTCPConnection -LocalPort 7777` afterwards.
- **Login response shape:** `data.accessToken` (camelCase), NOT `access_token`.
- **Working credentials** (weak on purpose, shared test DB — must all die before real users):
  - admin — `DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_PASSWORD` from root `.env` (`innocenz@gmail.com`)
  - agency — `owner@atlas-agency.my` / `Password123!`
  - outlet — `owner@velvet23.my` / `Password123!`
  - **pr — `pr.vicky@innocenz.demo` / `password`** (NOT `Password123!` — this cost a wasted pass)
- **Get the route list from `src/router/v1.ts` (`router.use(`) before writing any check.** Three of my
  four non-PR flags were wrong guessed paths, not bugs: `/outlet-workspace` needs `/:outletId`,
  it is `/rbac/role` (singular, plus `/module`, `/permission`, `/user-role`), and `/admin-request`
  GET is `requireAdmin` **by design** so an agency 403 there is correct.
- PowerShell gotcha: collecting results inside a function needs `$global:` or an
  `ArrayList` — `$script:` silently produced an empty table.

## What it found beyond the leak — corrections in BOTH directions

- **jk's PV export lane is SOUND — I predicted a hole in the audit and was wrong.** It is mounted
  above `authenticateJWT` deliberately (a browser download cannot send a Bearer header). The mint
  checks `existing.prId !== pr.id` → 404, and the public credential is a 128-bit, 5-minute,
  in-memory, single-voucher ticket. Reusable within its TTL on purpose — Android probes the URL
  before downloading. **Do not "harden" this without reading the comments first.**
- **Decisions D1/D2 are MOOT on live data.** All 6 `pr` rows have a `userId` and **no user owns more
  than one**. `8cf26f3` stays correct as defence (nothing in the schema prevents a second row), but
  there is nothing to consolidate. **Corrects the earlier note claiming Vicky had two rows — she does
  not.**
- **`/shift-assignment/attendance-fixes` is live-verified**: 200 agency, **403 outlet AND 403 pr**.
  The deliberate outlet privacy exclusion is enforced by the server, not just documented. Drops the
  "never runtime-fired" list from 6 to 5 (the panel's React rendering is still unexercised).
- **PR role fully exercised**: all six `/mine` endpoints 200; correctly refused `/payment-voucher`,
  `/pr`, `/collection-invoice`, `/platform-config`, `/shift-assignment`, `/rating`.

**How to apply:** a sweep like this costs well under an hour and found in two minutes what days of
clean `tsc` did not. Run it before believing any "all closed" claim — see
[[client-readiness-verdict]] and [[current-state-and-audit]].
