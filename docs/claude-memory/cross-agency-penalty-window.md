---
name: cross-agency-penalty-window
description: attendanceWindow had no agency_id term, so every weekly penalty judged a PR on all four agencies at once — FIXED 26 Aug 2026 by making agencyId required
metadata:
  type: project
---

`ShiftAssignmentRepository.attendanceWindow` — the query behind `min_shifts_per_week`,
`late_per_week` and `max_mc_per_month` — filtered on `sa.pr_id` and the shift date and carried
**no agency term**. FIXED 26 Aug 2026: `agencyId` is now a REQUIRED input with
`and sa.agency_id = …` in BOTH the `wk` and `mth` CTEs.

**Why:** both callers were ALREADY agency-scoped when choosing which PRs to judge
(`listPrIdsForWeek(agencyId, …)`), and that is precisely what hid it — the right people were
measured against the wrong window, so nothing at the call site looked wrong. `max_mc_per_month`
would fine a PR for MCs a different agency approved and print that count in the fine's own detail
line; `min_shifts_per_week` let one agency's shifts satisfy another's minimum. Same shape as
[[cross-agency-voucher-contamination]]: a weekly lookup missing its agency predicate, with `tsc`
and `check:drift` both staying green because only the SQL was short a term.

**How to apply:** two rules worth carrying forward.
(1) **Make a scope parameter REQUIRED, never optional.** An optional scope is one a future caller
forgets, and that omission type-checks; required turns the next such mistake into a compile error.
It also means a clean `tsc` IS the proof every caller was updated.
(2) **When one module states a rule, grep its siblings for the same table.** `pr-stats.ts` reads
the same table and the same `leave_approved` concept and says in its header that querying without
the agency predicate "would show each agency the other's numbers" — the rule was written down and
its sibling still broke it. See [[audit-entries-are-leads]].

Proof lives in `_probe-penalty-window-agency-scope.ts` (READ-ONLY, loops every multi-agency
PR-month): Victoria Tan Mei Lin, Aug 2026 — 20 assignments, **19 Atlas / 1 Why We Met**, so Why
We Met's rules read 20 assignments and 12 completed where the truth is 1 and 0. ⚠️ The MC
over-count is **latent**: no PR yet holds approved MCs at two agencies in one month, so it is the
opportunity figures that were wrong in practice. ⚠️ The fix makes fines APPEAR that the leak was
suppressing — a PR who looked compliant on another agency's shifts no longer does.
Related: [[mc-leave-blocks-whole-day]], [[green-signals-that-lie]].
