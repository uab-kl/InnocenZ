---
name: store-roster-empty-on-real-session
description: "The zustand store's `agencyPRs` does not hold the agency's PRs on a REAL session — a lookup against it passes unit tests and silently misses live; use the server roster (`useAgencyPrs` / `useVoucherRoster`)"
metadata:
  type: project
---

**Found live, 29 Sep 2026.** The 28 Sep audit fix "the IC comes from the profile via `pr_id`"
(`rosterPrForVoucher` / `voucherPayeeIc` / `buildAgencyPayee`) was unit-tested with a populated
fake roster and passed. On the live agency Payroll page it changed nothing: the page passed the
zustand store's `agencyPRs` (and `ownedByAgency(...)` of it), which a real session never fills
from the backend — so every lookup by the voucher's `prId` missed and fell back to the voucher's
copied `pr_ic`. Vicky's profile IC was corrected on 8 Sep; eight of her vouchers kept printing the
old one (and a payee code derived from it) while Manage PR — which reads `useAgencyPrs()` — printed
the new one.

It also hid a second bug: `resolvePvPrName` matched the IC copy FIRST and returned the roster's
`name` (the WORKING name), so once a real roster was supplied the same PR read "Vicky" on one
voucher and "(Vicky) Victoria Tan Mei Lin" on the others, and the week's PR count (a Set of names)
counted her twice. Fixed: resolve by FK first, return the legal `icName`.

**Why it matters:** a green unit test proves the function, not that the page hands it real data.
The store is the demo layer (see [[demo-data-leaks-into-real-sessions]],
[[outlet-panel-reads-demo-slices]]); real-session data comes from React Query hooks.

**How to apply:** any screen that joins a backend row to "its PR" must take the roster from
`useAgencyPrs()` (or `useVoucherRoster()` in `agency-portal/hooks/`, which falls back to the store
only when the server roster is empty — i.e. a demo session). When verifying such a fix, look at a
row whose copied field DIFFERS from the source of truth — a row where they agree proves nothing.
Related: [[confirm-before-asserting]], [[green-signals-that-lie]].
