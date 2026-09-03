---
name: vite-build-was-a-development-build
description: Every `vite build` in apps/web was silently a DEVELOPMENT build — Vite reads isProduction from NODE_ENV, not from mode
metadata:
  type: project
---

`nx build innocenz-admin` produced a **development** bundle for months. The
symptom was that no server-rendered route worked: `jsxDEV is not a function`.

**Vite derives `isProduction` from `process.env.NODE_ENV`, NOT from `mode`.**
On this path it resolved `mode: "production"` while NODE_ENV stayed
`"development"`. So the JSX transform emitted `jsxDEV()`, while React's CJS
wrapper still folded to `jsx-dev-runtime.production.js` — where
`exports.jsxDEV = void 0`. The client bundle shipped React's dev build too.

Fixed by `innocenz:force-production-node-env` in `apps/web/vite.config.ts`.

**Why the first attempt failed:** I placed it AFTER `nitro()`, reasoning that
plugin `config()` hooks run in array order and nitro loads the repo-root `.env`
(whose `NODE_ENV=development` belongs to apps/backend). Wrong on both counts —
NODE_ENV was already "development" before the config file even loaded, and
**nitro builds the `client` and `ssr` environments inside its OWN config() hook,
freezing NODE_ENV into their `define` right then.** Fixing it later corrected
only the `nitro` environment.

**How to apply:**
- `enforce: "pre"` on that plugin is **load-bearing**. Do not reorder it.
- Gate on `env.mode === "production"` so `vite build --mode development` still
  works on purpose.
- **Probe per environment, not globally.** Top-level `isProduction` read `true`
  while `client` and `ssr` still had `define["process.env.NODE_ENV"] ===
  "development"`. A single global check would have said the bug was fixed.
- Verify by grepping the OUTPUT for `jsxDEV` (want 0 in
  `.output/server` and `.output/public/assets`) and for the dev-only React
  string `Use the Babel transform instead`, not by reading config.
- The other half of a bootable server is the nitro `__exportAll` chunk cycle —
  see [[nitro-chunk-cycle-kills-the-server]].
