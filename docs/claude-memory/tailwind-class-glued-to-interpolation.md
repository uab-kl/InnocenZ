---
name: tailwind-class-glued-to-interpolation
description: "In apps/web, a Tailwind arbitrary-value class written immediately before ${...} in a className template literal is silently dropped from the built CSS"
metadata: 
  node_type: memory
  type: project
  originSessionId: cad763b1-d0d9-459a-9522-772aec2aa01f
  modified: 2026-08-26T04:17:45.471Z
---

`apps/web` builds Tailwind v4 through `@tailwindcss/vite`. Its scanner **drops a
candidate whose arbitrary value is glued to an interpolation**:

```tsx
className={`mt-2.5 max-w-[62rem]${twoUp ? " xl:max-w-none" : ""}`}   // ❌ max-w-[62rem] emits NOTHING
className={`mt-2.5 max-w-[62rem] ${twoUp ? "xl:max-w-none" : ""}`}   // ✅ one space fixes it
```

**Why it is easy to miss:** a class ending in a letter or digit survives the same
position — `font-extrabold${…}` and `!mb-0${…}` are both in the bundle. Only the
ones ending in `]` die. And nothing fails: tsc is green, biome is green, the
build succeeds, and the element simply renders without that rule. A dropped
`border-[var(--iz-line)]` falls back to `currentColor`, so hairlines come out in
the text colour rather than vanishing — it reads as a design choice, not a bug.

**How to check (30 seconds, proven 26 Aug 2026).** Grep the built CSS for the
DECLARATION, not the class — and watch the escaping:

```bash
pnpm --filter innocenz-admin build
grep -oF 'max-width:62rem' apps/web/.output/public/assets/*.css | wc -l
grep -oF 'xl\:grid-cols-2'  apps/web/.output/public/assets/*.css | wc -l
```

Traps in that grep itself, each of which bought a wrong conclusion first:
- CSS escapes the dots too, so `[5.5rem]` never matches — the file holds
  `\[5\.5rem\]`. Search the declaration (`width:5.5rem`) instead.
- Tailwind v4 emits **`@media (width>=1280px)`**, not `min-width:1280px`.
  Searching the old syntax says "no responsive classes exist" about a bundle
  full of them.
- `grep -c` counts LINES, and minified CSS is one line — always
  `grep -oF … | wc -l`.
- There are two bundles; the utilities are in `styles-*.css`, not `index-*.css`.

Find the pattern with `grep -rn '\]\${' apps/web/src --include=*.tsx`. On
26 Aug 2026 the whole app had exactly 3, all now spaced.

Same family as [[green-signals-that-lie]] and
[[vite-build-was-a-development-build]]: every checker passed because none of
them looked at the artifact that mattered.
