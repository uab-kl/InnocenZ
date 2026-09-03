---
name: demo-data-leaks-into-real-sessions
description: Demo fixtures can render inside a REAL agency/outlet session — root cause was a hand-maintained blank-reset list; now derived from buildDemoStoreReset() keys
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c5ccb3a-1b60-4b89-b695-e6bf764672ea
  modified: 2026-08-04T05:18:02.129Z
---

Fixed 29 Jul 2026 after a coworker saw **PRs that do not exist in the DB** on a real Atlas
Agency owner session. Two separate traps, one symptom.

## The leak: `buildBlankPortalReset()` was a hand-maintained allowlist

`apps/web/src/agency-portal/lib/demo-seed.ts`. Real logins blank every demo slice via
`buildBlankPortalReset()`, called on **every mount** of `routes/agency/route.tsx` and
`routes/outlet/route.tsx` (not just at login) because the zustand **persist merge re-seeds
slices on reload** — that is why a leak comes and goes instead of failing outright.

It was 27 hand-written keys. `prSwapRequests` was never added, though it IS seeded
(`store.ts` initial state `[...SEED_PR_SWAP_REQUESTS]`) and IS in `buildDemoStoreReset()`.
`routes/agency/roster.tsx` renders it as "PR swap requests" cards showing
`swap.requestingPrName` — a fixture name, on a real tenant's screen, gated behind
`canAssign && pendingPrSwaps.length > 0` (so it also disappears once acted on, then returns
on the next rehydrate).

**Now:** the explicit map is `explicitBlankSlices()` — only slices whose blank value is not
simply "empty" (object slices needing a `DEFAULT_*` shape; `outletPnl` and
`agencyReconciliation`, which must be RECOMPUTED from empty inputs, not emptied — passing
`undefined` to `recomputeAllOutletPnl` falls back to the seeded outlet list and leaks demo
outlets at RM 0). `buildBlankPortalReset()` then walks `buildDemoStoreReset()`'s own keys and
blanks anything else generically: arrays → `[]`, numbers → `0`. Anything of another type is
**reported via a DEV console.warn** rather than guessed at, because blanking an object blind
crashes components reading nested fields. **A demo slice added later is now blank-by-default
for real accounts.**

## The second trap: `owner@atlas-agency.my` is ALSO the demo login

`apps/web/src/lib/auth/agency-demo-session.ts`: `AGENCY_DEMO_EMAIL = "owner@atlas-agency.my"`,
`AGENCY_DEMO_PASSWORD = "password"`. Same email as the real backend account (real password
`Password123!`). The demo branch mints a **fake JWT** (`alg:"none"`, suffix `.demo`), seeds the
store as "Atlas Agency" + `agency_owner`, and never calls the backend. Nothing on screen says
demo. `getPortalSessionKind()` reads localStorage `iz-session-kind` and **unset counts as
demo**, so legacy/cleared browsers keep fixtures too. Not the cause this time (the coworker
used the right password) but a live footgun.

**FIXED 29 Jul 2026 (`0df2c00`).** Demo logins are now **`demo@atlas-agency.invalid`** and
**`demo@velvet23.invalid`** (password still `password`) — `.invalid` is RFC 2606 reserved, so a
real credential can never fall into the demo branch. `PortalShell` also renders a **"Demo data"
badge** in the header whenever `getPortalSessionKind() !== 'real'`, which deliberately includes
the unset/legacy case. Tell anyone using the old demo addresses.

## Also fixed: the cell-tap assign swallowed every failure

`RosterBackendTimetable.tsx` → `AssignBackendCellSheet.confirm()` called `onAssign(...)` then
`onClose()` **without awaiting**, and `roster.tsx` passed a bare `assign.mutate(...)` with no
`onError`. A 403, a 409 ("PR is already assigned to this shift"), or an unreachable API all
looked identical: sheet closes, cell stays empty, nothing said. Now `onAssign` returns a
promise (`mutateAsync`), the sheet awaits it, and on rejection shows the server message via
`toMutationError` (`apps/web/src/lib/mutation-error.ts`) and stays open.

Related 409 trap, still true by design: when any timetable filter is active, a slot failing the
filter renders as a **free `+` cell**, so assigning there re-posts a duplicate.

~~**Still silent, same mutation:** `BackfillPanel.tsx`~~ **ALSO FIXED (`b654ae7`)** — same
treatment: awaits `mutateAsync`, closes only on success, renders the server message on failure.
`isPending` still drives `busy`, so the buttons re-enable on rejection. Both assign paths now
report failures.

## ✅ CLOSED 4 Aug 2026 — 21 leaking slices are now 1 (`6a6adca`)

**Twelve went to a generic rule**: strings → `""`, booleans → `false`, and **`null` → `null`** —
that last one because `typeof null === "object"`, so a slice whose demo value was *already* null
was reported as unblankable when null is exactly its blank. Eight more got explicit entries
(nullable session objects → `null`, `prSessionByRole`/`prCheckInMeta` → `{}`, `notificationPrefs`
→ its real default).

🔴 **Reading the declared types caught a bug in the pre-existing generic rule.**
`acceptedShiftIndex` is `number | null`, and the rule blanks every number to `0` — but **`0` is a
VALID index meaning "the first shift was accepted"**, not "none". Now explicit.
*The empty value of an index is null, and a rule that maps every number to 0 cannot know that.*

⚠️ **`prComcard` is deliberately left unblanked** and still named in the warning. The obvious
candidate, `DEFAULT_COMCARD` in `comcard-demo.ts`, is typed **`ComcardDemoStyle`** — a comcard's
*styling*, not a comcard. Using it would have written the wrong shape purely because the constant's
name read correctly. Blanking it needs a real empty `PrComcard`, which does not exist.
**One honest warning beats twenty-one silenced ones.**

**Why it hid so long:** every one of the 21 is a PR-portal slice, and **no agency or outlet screen
reads them** — the leak was invisible from the screens anyone was looking at.

## ✅ ALSO 4 Aug — the demo login is DEV-ONLY (`d5889f8`), and the AUDIT was quoting the old credential

`routes/login.tsx` checked the demo credentials **before** the real login in every build, with no
environment guard. Now wrapped in `import.meta.env.DEV`, which Vite replaces with the literal
`false` at build time so the branch **and its dynamic import** are dropped.
**Proven by building it:** `vite build`, then **1,147 emitted files** counted —
`demo@atlas-agency.invalid` 0 · `demo@velvet23.invalid` 0 · `isAgencyDemoLogin` 0 ·
`startAgencyDemoSession` 0, while `auth/login` 2 and `startAgencyRealSession` 4 confirm the real
path survived. *Counts with known-present controls, because an empty grep result is
indistinguishable from a broken grep.*

⚠️ **The published audit's pre-pilot gate 2 still described `owner@atlas-agency.my` + `password`
and called it "an auth bypass into a real portal".** Both wrong, and **this memory was right all
along** — that credential was retired on 29 Jul (`0df2c00`). The planted JWT is also `alg:"none"`
signed `"demo"`, which the backend rejects, so it only ever opened a client-side demo shell.
*A gate copied forward without re-deriving it can outlive the thing it guards against.*

## ~~OPEN~~ (historical): the 21 slices, named by the new warning

The DEV warning fired on a real Atlas login 29 Jul 2026 and listed every slice it could not
blank generically (all objects/strings, so the shape cannot be guessed):

`paymentCardLast4 · postSealRatePrompt · prSessionByRole · shiftAccepted · pendingApproval ·
acceptedShiftIndex · checkedIn · checkedOut · prActiveShift · prComcard · prDisplayName ·
prIcName · prMobile · prEmail · prAvatarPhoto · prPayrollAgencyId · prMarketplaceApplication ·
prAgencyTiedAt · prCheckInMeta · prLeaveRequest · notificationPrefs`

All PR-side — the same phantom-data class as `prSwapRequests`, on the PR portal instead of the
agency one. Each needs an explicit entry in `explicitBlankSlices()` with a sensible empty shape.
**Not yet done.** This list is the work item; the warning will re-print it any time.

Verified: `nx build innocenz-admin` green. `tsc` on apps/web has a **pre-existing** 128-error
backlog (router path typing + unused imports) — it does not gate the build; the 4 demo-seed
errors are dead imports that predate this work. See [[green-signals-that-lie]].
