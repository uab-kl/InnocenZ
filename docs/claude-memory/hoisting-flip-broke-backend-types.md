---
name: hoisting-flip-broke-backend-types
description: A dependency bump in apps/web silently flipped which @types copy hoists to root and gave apps/backend 42 TS2742 errors
metadata:
  type: project
---

Bumping `@tanstack/router-plugin`/`router-cli` in **apps/web** (21 Aug 2026) put
**apps/backend** from 0 type errors to **42**, every one `TS2742` on a
`*.routes.ts`: *"The inferred type of 'router' cannot be named without a
reference to 'express/node_modules/@types/express-serve-static-core'."*

`webpack-dev-server` drags in the Express-4 types (`4.19.9`). With
`node-linker=hoisted`, **which copy wins the root slot shifts when the overall
dependency set changes** — the churn let 4.19.9 hoist to root, leaving the real
`5.1.2` reachable only at a nested path the backend cannot name.

**Why:** nothing in the diff mentioned express. The lockfile resolutions were
byte-identical before and after — only the *layout* moved. So neither the diff
nor a lockfile grep would ever have shown it.

**How to apply:**
- After ANY dependency change, re-run typecheck on **every** app, not just the
  one you touched. Hoisting is global.
- Attribute regressions by A/B, not by argument: restore the pre-change
  lockfile, `pnpm install`, re-count. That is what proved this was mine —
  0 before, 42 after. See [[confirm-before-asserting]].
- Fix: pin in **`pnpm-workspace.yaml`** overrides. The root `package.json`
  `pnpm.overrides` block is **ignored by pnpm 10** (it prints a warning on every
  install) — `@expo/dom-webview` and `expo-constants` are still stranded there.
- Belt and braces: have the app **declare the @types package directly** so its
  own resolution stops depending on a global hoist.
- Two copies of one package is the same failure family as
  [[tool-paths-are-relative-to-its-root]].
