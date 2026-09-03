---
name: outlet-panel-reads-demo-slices
description: "Zustand demo data retired (store boots blank, prComcard kept); and the outlet Today panel renders cards from BACKEND props while resolving everything else from empty DEMO slices — 3 buttons fixed, shift-history rows still open"
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-06T07:54:18.778Z
  originSessionId: f3bd5ae2-bc34-4308-9849-8d4b1f0df57f
---

**6 Aug 2026.** Everything below was verified in a real browser session, not inferred.

## Demo data is retired — the store now boots BLANK

`store.ts` built its initial state from `buildDemoStoreReset()`, so fixtures were ambient and each
real login had to overwrite them on mount. That ordering is now inverted: `initialSnapshot`
(renamed from `demoSnapshot`) comes from **`buildBlankPortalReset()`**.

- `prComcard` deliberately survives — the ONE slice with no sound blank value (the obvious
  constant, `DEFAULT_COMCARD`, is a comcard's *styling*, not a comcard). PR-portal only.
- The DEV warning `[buildBlankPortalReset] demo slice(s) with no blank value: …` is the **live
  list of anything that ever slips through**. On 6 Aug it named exactly `prComcard`. Run a real
  login and read the console — that warning is the instrument, don't guess.
- Fixtures still exist on disk and stay reachable via `resetDemo()` — an explicit action now.
- 🔴 **Fixed a latent bug doing this:** `buildBlankPortalReset()` ended with
  `return blank as ReturnType<typeof explicitBlankSlices>` — a cast naming only the hand-declared
  slices while the function actually returns *every* demo key. It hid ~12 (`checkedIn`, `drinks`,
  `prPortfolio`, `paymentCardLast4`…). Harmless while only fed to `setState` (which takes a
  partial); it surfaced the moment it became the INITIAL state and a third of the slices came back
  untyped. Now `Omit<ReturnType<typeof buildDemoStoreReset>, "prComcard">`.
- Web tsc stayed at its **exact 120-error baseline** (25 in store.ts) before and after.
- ⚠️ `paymentCardLast4 ?? "4242"` still sits in the persist merge — invented data outside the
  snapshot that renders as a real card.

## 🔴 THE BUG FAMILY — cards come from the BACKEND, everything else from DEMO slices

`OutletTodayOperationPanel.tsx` takes `roster` and `agencyPrs` as backend overrides
(`rosterOverride ?? storeRoster`). **`prs` has no override** — it is read straight from the store.
The card list resolves a PR by `prs.find()` **with a fallback to building one from `agencyPRs`**,
which is why a backend PR renders at all. Every other lookup did a bare `prs.find()` with no
fallback.

**Result: every card appeared and every button did nothing.** The click set its state, the lookup
returned null, and the render gate (`openPr && openPrData && …`) silently declined to mount the
sheet. No error, no empty state, nothing in the console — the worst shape a bug can take.

✅ **FIXED** — added `prOnScreenById` (a Map built from `staffTonight`, which already carries the
resolved PR) and pointed `openPrData`, `historyPr`, the comcard-preview name and
`liveEarningsRows`' `prIds`/`prNameById` at it. Live-proven: Shift history → `SHIFT LOG · VICKY`,
Live sales → `Live sales · Vicky`, Rate → opens. **The invariant: a card that can be shown is a
card whose sheets can open.**

## 🔴 STILL OPEN — start here next session

1. ✅ **CLOSED 6 Aug — shift-history rows now hydrate from the backend.**
   `OutletPrShiftHistorySheet` called `useStore(s => s.shiftHistory)`, which **nothing** hydrates
   from the backend (only `history-demo-sync.ts`, on the History page) — so the sheet said "No shift
   history yet" from Today and showed 8 real rows only after you had visited History.
   Fixed **not** by threading a prop but by calling `useOutletHistory()` **inside the sheet** and
   preferring it when `backed` — the same shape `useAgencyRatings()` already had two lines above, and
   it shares the History screen's query keys so it costs no extra fetch. Also split *Loading…* from
   the empty state: an in-flight request must not read as a verdict. Live: 10/10 completed
   assignments usable, Vicky 8 + Alice 2 at Emhub Testing. Landed together with a second, unrelated
   fault on the same card — see [[outlet-read-a-foreign-agencys-tier]].
2. **`DAILY WAGES RM 40.00` in the outlet Live-sales sheet** where the sealed figure is
   **RM268.33**. The sheet computes from the rate card instead of reading the sealed `payAmount`,
   and falls back to `TIER_WAGE_MIN = 40` when a shift has no `shift_pay_tier` rows. Same root as
   the `RM 40–80/shift` header. **Money-facing — rank this first.**
   ⚠️ The RM40/50/55/65/80 table is `40 × [1,1.2,1.4,1.65,2]` snapped to 5s — the FLOOR, not the
   hourly rate. Live DB check: all 119 `shift_pay_tier` rows are 500/600/700/825/1000 and match
   their workspace card exactly, so **no live shift carries a bad override**.
3. Cosmetic: raw `Out 2026-08-06T06:17:45.947Z` where local time belongs; raw PR uuid rendered
   under the name in the Live-sales sheet.

**None of these are regressions from the blanking** — on a real session those slices were already
emptied on every route mount, long before. See [[demo-data-leaks-into-real-sessions]] and
[[wage-is-flat-cutloss-unbuilt]].

⚠️ **A stale Vite module graph made the button fix look broken.** It worked immediately in a NEW
tab. Always re-test in a fresh tab before believing a web fix failed.
