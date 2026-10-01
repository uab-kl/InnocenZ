---
name: condensed-biome-says-clean
description: "The RTK-condensed `npx biome check` output printed \"Lint: No issues found\" while 3 biome errors (formatter + a11y) stood — run it raw with `rtk proxy` before reporting biome clean"
metadata:
  node_type: memory
  type: feedback
  originSessionId: c6cdc664-67bd-4076-92b6-99ab40e57077
  modified: 2026-10-01T06:47:44.229Z
---

On 1 Oct 2026 the condensed output of `npx biome check <files>` in apps/web read **"Lint: No issues found"**, but `rtk proxy npx biome check <same files>` showed **3 errors** (two formatter diffs on new files, one `lint/a11y/useSemanticElements`). The summary appears to report only the lint category and drop formatter findings.

**Why:** a green from a summarising wrapper is evidence about the wrapper, not the code — the same family as [[absent-evidence-is-about-the-instrument]] and [[green-signals-that-lie]]. Reporting "biome clean" off that line would have shipped unformatted files.

**How to apply:** before stating biome is clean in apps/web, run `rtk proxy npx biome check <files>` and read the `Found N errors` / `Checked N files` footer. Fix with `rtk proxy npx biome check --write <files>` (formatter) and by hand for lint rules. Biome runs from apps/web only — see [[biome-scope-and-mobile-style]].
