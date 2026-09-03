---
name: import-cycle-killed-agency-portal
description: "A latent circular import took the whole agency portal down after tsr generate re-ordered route imports — fixed with a leaf module; plus the stale-Vite-HMR trap that made the fix look broken"
metadata:
  node_type: memory
  type: project
  originSessionId: 93d11136-6321-41ee-b369-237169aa90bc
  modified: 2026-08-04T02:40:57.038Z
---

**4 Aug 2026, `b536233`.** The agency portal died on arrival with
**`Cannot access 'DEFAULT_PER_TABLE_RM' before initialization`** — a blank error screen, whole
portal, every page.

**A real circular import.** `outlet-demo.ts` imported that **value** from
`outlet-financial-sync.ts`, which imports back from `outlet-demo.ts`. The fatal detail is *when*:
`outlet-demo` reads it at **module-EVALUATION time** (its `priceRm` / `perTableRm` object
literals), not inside a function. So whichever module the bundler entered first decided whether the
app booted — enter `outlet-financial-sync` first and it suspends at its `outlet-demo` import,
*above* the `const` declarations, and `outlet-demo` grabs a binding still in the temporal dead zone.

**The cycle pre-dated the work that exposed it.** `npx tsr generate` (run for a new route)
**re-ordered the route import list**, which changed module entry order and turned a latent cycle
fatal. ⚠️ **Re-ordering was not the bug.** It would have gone off on any future import-order change.
**A cycle that "works" is a cycle that has only been lucky about entry order.**

**Fix — a LEAF module.** The four defaults moved to `outlet-financial-defaults.ts`, which
**imports nothing**; a module with no imports can never be observed half-initialised, so both sides
may depend on it. `outlet-financial-sync` imports them for its own use and **re-exports all four**,
so every existing import site is unchanged. `outlet-demo` no longer imports
`outlet-financial-sync` **at all** — the edge is removed, not merely reordered.

⚠️ **Gotcha while fixing:** `export { X } from '...'` does **not** bind `X` locally. This file uses
two of them internally, so it needs **both** an `import` and a separate `export { … }`.

## 🔴 A stale Vite HMR graph reported the fix as still broken

After the edit the console kept throwing `DEFAULT_DRINK_UNITS is not defined` — **and a full page
reload did not clear it.** What gave it away: the stack trace's module URL carried an **older `?t=`
timestamp** than the one Vite was actually serving, and fetching the transformed source
(`fetch('/src/.../outlet-financial-sync.ts')`) showed the import present and correct. **A brand-new
tab was clean.**

**Check the `?t=` stamp in any post-edit stack trace before believing it, and open a fresh tab
rather than reloading** — an HMR graph can wedge and keep re-serving a dead module. Belongs beside
[[green-signals-that-lie]] and [[confirm-before-asserting]]: this is a red signal that lied.
