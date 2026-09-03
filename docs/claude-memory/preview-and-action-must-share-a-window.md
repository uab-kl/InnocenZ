---
name: preview-and-action-must-share-a-window
description: "🟢 FIXED 20 Aug 2026 — the Payroll penalty PREVIEW and the button that charges it computed the same fact from DIFFERENT weeks, so on any closed week the fines Record would seal were never listed. The only symptom was a UX complaint: 'I have to press it just to see them'."
metadata: 
  node_type: memory
  type: project
  originSessionId: 05a021ad-ec40-4525-bb98-6a3073c4bca0
  modified: 2026-08-20T05:10:01.419Z
---

The owner asked to "just show the penalties instead of clicking Record to see them". It read
as a layout request. It was a window mismatch between a read and its own action.

## The fault

Two handlers in `agency-penalty-rule.controller.ts`, same evaluator, different windows:

- `listProposals(W)` — live rules (lateness, MC cap) from **W**, minimum-shifts from **W−1**.
- `sealWeek(W)` — if `weekEnd < today`, **everything from W**; else live-only from W.

The `W−1` fallback is right for a *running* week: "1 of 3 shifts" is not a verdict on Tuesday.
It was applied unconditionally. So on the **Last Week** tab — a closed week — the seal recorded
that week's min-shifts while the list never named them. **Pressing the button was the only way
to learn the charge existed**, and the press also created it. Looking cost money.

⚠️ The panel had already been fixed once for exactly this shape: proposals were added so a week
with breaches would stop reading "nothing outstanding". That fix was real, and the SECOND half
of the same bug survived it, because the two windows were never compared. A preview is only a
preview of the action it shares a window with.

**The rule:** when a list previews what a button will do, derive both from one expression. The
fix copies `sealWeek`'s literal `weekEnd < new Date().toISOString().slice(0,10)` rather than
re-deriving "closed", so the boundary week cannot drift back apart.

## The tell, for next time

The complaint was never "wrong number" — it was "why must I press this to see". Treat that
sentence as a **diagnosis, not a layout note**: it means a read and a write disagree, and the
write is the one telling the truth. Same shape as [[oldest-membership-was-the-agency]] (read
filtered by agency, write resolved by age), but inverted: there the read was the correct half.

## A button on an empty state is a question, not an action

`Record penalties for this week` rendered on every week, clean ones included. A button that is
always there, sitting next to "nothing outstanding", reads as the way to **discover** — press
it and find out. It now lives under the list of what it would charge and disappears when that
list is empty. Where an action is placed is an argument about what it does.

## Also shipped in the slice

- `pending` is filtered to the selected week, so a tab shows exactly what its own button seals
  — no fine visible on two tabs but recordable on only one.
- **Payment Week no longer mounts the panel at all.** A signed voucher cannot take another
  line, so every action there was refused; a debt shown to someone forbidden to act on it is
  furniture. Nothing is lost — the sealed lists are SPLIT, not filtered, so a fee dated in that
  week still appears under "Carried over from other weeks" on the two tabs that can charge it.
  That split, built earlier for a different reason, is what made the removal safe.
- `canRecord` and two orphaned translation keys deleted rather than left dead.

## Proof

⚠️ **Not click-through verified** — signing in needs a password typed into a form, which I do
not do (the standing limit, see [[oldest-membership-was-the-agency]]). Verified instead:
backend `tsc` 0 errors; `apps/web` `tsc` clean on the three touched files; biome unchanged;
Vite transformed all three modules 200; and the compiled route chunk read back to confirm
`payrollWeekTab !== "last_last_week" && …<UnchargedFeesPanel` wraps the mount. The live
click-through is queued in `TEST_SCRIPT.md` §9.

See [[fix-named-by-symptom-hides-siblings]], [[confirm-before-asserting]].
