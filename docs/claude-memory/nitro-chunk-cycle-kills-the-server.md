---
name: nitro-chunk-cycle-kills-the-server
description: A green `nx build` does not mean the server runs — nitro splits one vite chunk into two that import each other
metadata:
  type: project
---

`nx build innocenz-admin` can be fully green while `node
apps/web/.output/server/index.mjs` 500s on **every** route with
`TypeError: __exportAll is not a function`.

Vite's SSR output is **correct** — `router-*.js` imports rolldown's
`__exportAll` helper from its runtime chunk. **Nitro then re-bundles**, splits
that single chunk into `router-<hash>.mjs` + `router-<hash>2.mjs` which import
each other, and strands the helper on the far side of the cycle. It is emitted
as a hoisted `var`, so it reads as `undefined` (hence "is not a function"
rather than a TDZ error) before its defining module body runs.

Worked around with `nitro({ inlineDynamicImports: true, ... })` in
`apps/web/vite.config.ts` — one chunk, no cycle. Cost measured: ~20 MB server
file, ~680 ms cold start, 91 ms warm. Bumping nitro to the current nightly did
NOT fix it.

**Why:** the intermediate build under `apps/web/node_modules/.nitro/vite/
services/ssr/assets/` is the control. Comparing it against `.output/server`
localises the fault to the re-bundle in one step — one `router-*` chunk there,
two here.

**How to apply:**
- **Never report a build as working from a green `nx build`.** Boot it:
  `PORT=3999 node apps/web/.output/server/index.mjs`, then curl a real route.
  This hid three separate defects behind one another this session.
- When output crashes but the bundler's own stage looks right, diff the
  intermediate against the final — the stage that changed the chunk graph owns
  the bug.
- Remove the flag when nitro stops splitting, and re-run the boot check.
- Pairs with [[vite-build-was-a-development-build]]; both had to be fixed
  before any route rendered.
