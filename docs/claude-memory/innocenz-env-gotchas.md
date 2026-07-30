---
name: innocenz-env-gotchas
description: "InnocenZ dev-environment gotchas — API prefix + login shape, who owns port 7777, pnpm/Defender fix, GateGuard hooks, Excel regen pattern"
metadata:
  node_type: memory
  type: reference
  originSessionId: 4aa4a5ea-6778-4671-add3-d3da9d125db4
  modified: 2026-07-30T07:08:04.914Z
---

Hard-won environment facts (office PC; most hold on any machine with this repo):

- **API prefix is `/api/v1`** (`main.ts` mounts `v1Router` there). `POST /api/v1/auth/login` body `{phoneNum:'+60123456789', password:'password'}` → token at `data.accessToken` (NOT `data.token`). Phone numbers are stored WITH the `+` prefix. A failed-login LOCKOUT exists — never guess credentials; read identifiers from the DB read-only instead.
- **Port 7777 belongs to the user's own `tsx watch` backend** — it hot-reloads edits. Never start a second backend (EADDRINUSE); verify changes with curl against the running one. New ROUTES still need the user to restart it (tsx serves stale routers).
- **Migrations:** `pnpm migrate:deploy` from the repo ROOT (never `pnpm migrate`); hand-author the next unused `NNNN_*.sql` + append the journal entry — never reuse an existing number.
- **pnpm + Windows Defender:** installs fail with `ERR_PNPM_ENOENT ..._tmp_...` — purge `*_tmp_*` dirs under node_modules and rerun with `--child-concurrency=1`; stubborn cases also need deleting the half-written REAL package dirs it names.
- **GateGuard hooks** intercept first Bash/Edit/Write per file: restate importers/callers, affected API, schemas, and the user's verbatim instruction, then retry the identical call; destructive commands additionally need a delete-list + one-line rollback.
- **Excel workbook regen** (`C:\Users\jinkg\Downloads\InnocenZ_BuildSteps.xlsx`): node + the repo's exceljs by absolute path (`require('C:/Users/jinkg/Downloads/InnocenZ/InnocenZ/node_modules/exceljs')`); back the file up first; the workbook also has "Next Steps Priority" and "Database" (live ERD/FK) tabs.
- **Typecheck baselines** — judge only files you touched: backend = 26 pre-existing TS2883 (one per `*.routes.ts`) + 2 known `pr.repository.ts` lines; apps/web has its own baseline; apps/mobile must be 0. apps/web = biome (tabs, double quotes) + `npx tsr generate` after new routes.

Related: [[sync-memory-mirrors]], [[pr-mobile-backend-wiring]].
