---
name: tool-paths-are-relative-to-its-root
description: A build tool prints paths relative to ITS root, not yours — I read the wrong node_modules copy and called a real duplicate a "rolldown bug"
metadata:
  type: feedback
---

`nx build innocenz-admin` failed with 4 MISSING_EXPORT errors naming
`node_modules/@tanstack/router-core/dist/esm/ssr/server.js`. I opened that path
from the REPO root, saw all four symbols exported, ran `node -e "import ..."`
and watched it succeed — and concluded it was a rolldown bug. I wrote that
conclusion into commit 737626a.

It was wrong. **Rolldown prints paths relative to the BUILD root, which is
`apps/web`.** There were two copies:

    node_modules/@tanstack/router-core           1.171.26  (has the symbols)
    apps/web/node_modules/@tanstack/router-core  1.171.15  (does not)

`apps/web` declared `@tanstack/router-plugin: ^1.132.0` → resolved 1.168.20 →
which pins router-core at an EXACT `1.171.15`, conflicting with the 1.171.26 the
rest of the TanStack tree wants, so pnpm nested the old one under `apps/web`
where the build's cwd makes it win. The error was literally true all along.

**Why:** every verification I ran was aimed at the file that was never loaded.
A passing check on the wrong artifact is not weaker evidence than no check —
it is worse, because it *manufactures* confidence. Compare with
[[absent-evidence-is-about-the-instrument]] and [[confirm-before-asserting]].

**How to apply:**
- Before trusting a path in a tool's error, ask **what CWD did that tool run
  in**. For an nx/vite build it is the app dir, not the repo root. Resolve the
  path from there, or `find . -type d -name '<pkg>'` and print every copy's
  version.
- **The tell I ignored:** within ONE import statement, `_getRenderedMatches`
  failed while `_getAssetMatches` beside it passed. One statement cannot
  resolve to two modules — so it was never resolution of the *import*, it was
  two copies of the *target*. When a symptom splits inside a single statement,
  stop theorising about the importer.
- Reproduce with the bundler ALONE before blaming it. A 10-line standalone
  rolldown bundle of the same four symbols succeeded, which ruled it out — and
  I should have run that first, not fourth.
- `node-linker=hoisted` makes which copy wins the root slot **order-sensitive**.
  See [[hoisting-flip-broke-backend-types]].
