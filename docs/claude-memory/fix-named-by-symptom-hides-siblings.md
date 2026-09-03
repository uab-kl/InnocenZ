---
name: fix-named-by-symptom-hides-siblings
description: "The roster's cancel and no-show silently did nothing — the identical bug was already documented three lines above in the same file, missed because that fix was written up as being about swaps rather than about ids"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: aed993f6-53d2-4695-9554-c1646d82b25c
  modified: 2026-08-04T05:21:42.117Z
---

**A fix recorded by its SYMPTOM will not find its own siblings.**

4 Aug 2026, `apps/web/src/routes/agency/roster.tsx` (`832887d`). The by-id write handlers branched on
`viewMode === "planning"`: planning hit the backend, live fell through to the demo store. But
`agencyRoster` is `backendRoster.slots` in **both** views — the file's own comment says *"Both views
read live backend data"* — so a live-view slot id is a **`shift_assignment` UUID**. The demo actions
look that id up in a demo slice that has never held backend UUIDs, find nothing, and return.

**Cancelling a shift or flagging a no-show from the Live tab wrote nothing at all, while the sheet
closed as though it had worked.**

⚠️ **Three lines above it, in the same file, sat this comment:**

> *"Outlet swaps are backend-backed: the demo store's `requestOutletSwap` matched the slot id against
> `agencyRoster`, but the roster now renders backend slots whose id is a `shift_assignment` UUID, so
> it silently found nothing and the button did nothing."*

Same cause, same file, three more handlers — and the earlier fix had been written up as being **about
outlet swaps**. Nobody re-read it as a statement about **ids**, so its siblings survived.

**Why:** a bug title is a retrieval key. Filed as *"the swap button didn't work"* it is found by
someone looking at swaps; filed as *"actions keyed by row id broke when the rows changed source"* it
is found by anyone touching any action on that screen. The narrower name is almost always the one
that gets written, because at fix time the symptom is what you were staring at.

**How to apply:**

- When a fix's cause is *"the data source moved and something keyed off the old ids"*, **write the
  cause in the note, not the symptom** — and immediately grep the same file for every other handler
  taking that id.
- *When a screen changes where its rows come from, every action keyed by row id has to move with
  them.* Treat that as a checklist item, not a discovery.
- A guarded branch is suspicious when the condition is about **which view**, but the thing it guards
  is about **which backend**. Here `isPlanning` was standing in for "is this backed?", which had
  stopped being true.
- Two honesty fixes shipped alongside, both the same shape: `late` has no backend field, so it now
  says *"Late flags are not recorded yet"* instead of writing to a store that does not hold the row;
  and the edit sheet reports `Not saved: <fields> — only status persists`. **A button that writes
  nowhere must say so.**

⚠️ **Not fired live:** the rewired cancel/no-show mutate real roster rows on the shared DB, and
unlike a refusal there is no free version of a successful write. Typechecked and render-verified only.

Related: [[audit-entries-are-leads]] · [[absent-evidence-is-about-the-instrument]] ·
[[roster-backend-wiring]] · [[outlet-swap-feature-build]]
