---
name: css-override-load-order-trap
description: A portal CSS override that relies on import order silently loses — Vite dev injected admin-design.css after a later-imported file
metadata:
  node_type: memory
  type: project
  originSessionId: 76c5c026-418e-4b9b-8924-c12205530acf
  modified: 2026-11-20T08:40:06.925Z
---

On 20 Nov 2026 (Afterglow Vivid, step 1) `styles/afterglow.css` was imported LAST in
admin-layout.tsx, yet in the Vite dev server `admin-design.css` was injected after it
(document.styleSheets index 21 vs 10), so admin kept its old background with no error.
Admin also re-declares its tokens on the inner `.iz-admin-portal`, which shadows body-level
token overrides.

**Why:** equal-specificity overrides depend on stylesheet order, and the bundler does not
guarantee import order across route chunks (dev or build).

The same trap inside ONE file, found later that day: admin's per-kind To do colours
(`html body .admin-todo__icon.lucide-*`) tied the admin base tile's specificity and came
earlier in afterglow.css, so every admin tile showed the default — invisible until sample
counts were faked in the browser (admin's queues were empty). Biome's
noDescendingSpecificity warning was pointing at it.

And the measuring tool had its own blind spot: the contrast sweep skipped any text over a
gradient, and the body carries the night glow, so text on the page background went
unmeasured. It now composites only the gradient layers under the text's own box.

**How to apply:** make a portal-wide override OUTRANK what it replaces (afterglow.css prefixes
every selector with `html`), name both `body[data-admin-design]` and `.iz-admin-portal` for
admin tokens, and prove it by reading computed styles per lane — list the matching rules
with `document.styleSheets` when a value will not change. Related: [[green-signals-that-lie]],
[[absent-evidence-is-about-the-instrument]] (the shell wrapper also summarised a biome FORMAT
failure as "Lint: No issues found" — run `rtk proxy` to read the raw result).
