---
name: dev-ports-shared-with-other-projects
description: Another project on 3000/7777/8081 (via WSL's wslrelay) was killed or REUSED by InnocenZ dev scripts; fixed 19 Nov 2026 — refuse, never kill
metadata:
  type: project
---

On the owner's PC a second project (same template, run in WSL) held **3000, 7777 and 8081**.
On Windows the listener for all three is `wslrelay.exe` — the bridge for EVERY WSL server — and
that project's backend answers `GET /api/v1/health` with 200 (`{"status":"ok","uptime":…}`).

Before 19 Nov 2026 `tools/scripts/dev-shared.mjs` (1) force-killed whatever held 8081/8082,
3001-3005 and a "dead" backend port — i.e. `wslrelay` — and (2) took ANY health answer as
"InnocenZ backend already running, reuse it", which would have sent portal logins and writes to
the other project's API.

Now: `probeBackend` → `'innocenz' | 'foreign' | 'none'` (InnocenZ's body is
`{success:true,data:{status:'healthy'}}`); `refuseForeignBackend` exits 1 with instructions;
`killPortListeners` kills only processes whose command line runs from THIS checkout.

**Why:** the owner runs other projects beside InnocenZ and was afraid they would conflict.
**How to apply:** never make a dev script kill or reuse a port holder it did not start — check
ownership (command line / response body) first. Running both side by side still needs InnocenZ
on its own backend port in `.env.local` (BACKEND_PORT + every URL naming it); the web port
moves up on its own. To see what holds a port: `listPortListeners([...])` in dev-shared.mjs, and
for WSL `ss -ltnp` inside `wsl`.

This PC's setup (19 Nov 2026): git-ignored root `.env.local`, ports only — web 3001, backend
7787 (+ every URL and CORS_ALLOWED_ORIGINS), `RCT_METRO_PORT=8082`. ⚠️ A port check that says
"free" is not proof on Windows: Expo saw 8081 as free while `wslrelay` held it, bound `::` beside
it, and `localhost:8081` served the OTHER app while the LAN IP served InnocenZ. Verify a shared
port by asking WHO answers (Expo manifest `name`, health body), not whether a bind succeeds. Related: [[innocenz-env-gotchas]], [[backend-port-7777]].
