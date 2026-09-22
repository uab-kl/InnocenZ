---
name: arrange-tabs-most-important-first
description: Every workbook and multi-page deliverable lists its tabs most-important-first; reference catalogues go last
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c6cdc664-67bd-4076-92b6-99ab40e57077
  modified: 2026-09-22T04:10:28.811Z
---

Owner, 22 Sep 2026: *"always arrange the all tabs and pages from the infront most important
to least important"*. A standing rule — every workbook and every multi-page deliverable, not
only the one being edited at the time.

**Why:** the first tab is what opens by default, so tab order IS the triage. Ordering by
importance means the page you need is where your hand already is. A reference catalogue can be
the biggest tab in the book and still belong last, because it is looked up rather than worked
from — its ranked distillation is what gets opened daily.

**How to apply:** decision pages first (what to do), then production pages (how to do it),
then cadence and measurement, then per-role reference, then the full catalogue last.
`marketing.xlsx` as of 22 Sep 2026: Start Here · Hero Picks · Video Prompts · Make It ·
Social Media Plan · Post Ideas · Weekly Tracker · PR · Agency · Outlet · Unique Features.

⚠️ **`InnocenZ_BuildSteps.xlsx` is already compliant and must NEVER be resorted.** Its 14 tabs
are numbered and colour-coded into three parts — Part 1 blue *Understand it*, Part 2 amber
*Judge it*, Part 3 grey *Look it up* — which is the same important→reference gradient, and
`CLAUDE.md` requires both the numbering and the colours preserved. Reordering it would make
every tab's number a lie.

Mechanically, tab order in xlsx is **only** the order of the `<sheet>` children of
`xl/workbook.xml`. Reorder those tags verbatim and reset `activeTab="0"`; nothing else in the
package addresses a sheet by position (`definedNames` and formulas name sheets, never index),
so no cell, drawing, formula or style is touched and the entry count must come out unchanged.
Refuse the write if any tab name is unknown or any expected tab is absent — a dropped `<sheet>`
tag deletes that tab. See [[buildsteps-workbook-house-style]] and
[[never-round-trip-marketing-xlsx]].
