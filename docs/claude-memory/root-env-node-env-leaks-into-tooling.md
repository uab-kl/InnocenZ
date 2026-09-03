---
name: root-env-node-env-leaks-into-tooling
description: One line — NODE_ENV=development in the repo-root .env — silently broke the vite production build AND the mobile jest suite
metadata:
  type: project
---

The repo-root `.env` sets `NODE_ENV=development` under a `# BACKEND` heading.
It is **untracked**, so no committed fix can touch it — and it broke two
unrelated toolchains, in the same way, weeks apart.

**1. `vite build` produced a DEVELOPMENT bundle.** Vite derives `isProduction`
from `process.env.NODE_ENV`, **not** from `mode`. Result: JSX compiled to
`jsxDEV()` while React's CJS wrapper folded to `jsx-dev-runtime.production.js`,
where `exports.jsxDEV = void 0` — so every SSR route died on
"jsxDEV is not a function", and the client shipped React's dev build.

**2. `nx run @org/mobile:test` failed while bare `npx jest` passed.** Jest sets
`NODE_ENV=test` only when it is UNSET, and **Nx injects the root `.env` into
every task**. React Native's `AnimatedProps.#connectAnimatedView` tolerates a
detached view only when `NODE_ENV === 'test'`; otherwise it throws
"Unable to locate attached view in the native tree". BootSplash animates on
mount, so rendering `<App />` always died.

**How to apply:**
- When a tool behaves differently under `nx run` than when run directly, suspect
  **injected .env**, not the tool. `npx jest` vs `nx run …:test` was the whole
  diagnosis.
- Fix it in a TRACKED file, since the root `.env` is per-machine:
  `apps/mobile/jest.config.cts` sets `process.env.NODE_ENV = 'test'` at the top;
  `apps/web/vite.config.ts` has an `innocenz:force-production-node-env` plugin.
- ⚠️ That vite plugin needs **`enforce: "pre"`** — nitro builds the `client` and
  `ssr` environments inside its own `config()` hook and freezes NODE_ENV into
  their `define` right then. Fixing it later corrects only the `nitro`
  environment. **Probe per environment, not globally**: top-level `isProduction`
  read `true` while client/ssr `define` still said `"development"`.
- Related: [[vite-build-was-a-development-build]],
  [[ci-instruments-that-passed-unconditionally]].
