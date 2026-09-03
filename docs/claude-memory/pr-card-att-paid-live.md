---
name: pr-card-att-paid-live
description: "Agency PR card's Att./Paid now derived from real rows (commit 74a6d96) — and why the owner's own screen still reads an em-dash and RM 0"
metadata: 
  node_type: memory
  type: project
  originSessionId: b8a19f55-ce7f-4e10-93f4-01a75e27fbd7
  modified: 2026-08-13T04:56:07.777Z
---

Built 13 Aug 2026, commit **74a6d96** on branch SL. `managedPrFromBackend`
hardcoded `attendancePct: 0`, `totalPaid: 0`, `checkIns/checkOuts/noShows: 0` on
every backend PR. New leaf `features/pr-personnel/pr-stats.ts` derives them:
**two grouped queries per page, never one per PR** (the roster asks for 500).

**The counting rule, because it is a judgement call and not obvious:**

- kept = `completed`; missed = `no_show` + `cancelled`
- **`leave_approved` is EXCUSED — out of the ratio entirely**, not a miss
- `assigned` / `confirmed` / `leave_pending` are unconcluded, excluded
- **denominator 0 → `null`, NOT 0.** `AgencyManagedPR.attendancePct` widened to
  `number | null` so both render sites print an em-dash. 0% accuses a brand-new
  PR of missing shifts nobody offered them — the same class of defamation-by-
  placeholder as `rating: 0` (see [[outlet-panel-reads-demo-slices]]).
- **"Paid" means PAID**: `sum(net)` where `payment_voucher.status='paid'` only. A
  sealed wage is a debt; a voucher at `sent`/`signed` has moved no money.

**Both are agency-scoped** on `shift_assignment.agency_id` /
`payment_voucher.agency_id` — one person holds an `agency_pr` row per agency, so
an unscoped query hands each agency the other's numbers. Same trap as
[[outlet-read-a-foreign-agencys-tier]]. **An outlet caller gets no `stats` block
at all**: agency→PR payroll is not a venue's business
([[dont-back-outlet-sales-vs-pv]]), so the whole object is withheld rather than
half of it leaked.

**⚠️ THE THING THAT LOOKS LIKE A BUG AND IS NOT.** The owner logs in as **Why We
Met Agency (32 PRs) — which has ZERO `shift_assignment` rows**. All 44 live rows
belong to Atlas. So their whole roster still reads "—" and RM 0. That is now the
*true* answer rather than a placeholder, but it is visually identical to the bug
it replaced. **Do not "re-fix" it — count `shift_assignment` rows by agency
first.** Real numbers do exist, on Atlas: Vicky **100% (10 kept, 1 excused) ·
RM 875.00**, Alice **100% (4 kept)**, Gan Jin Kai **50% (1 kept, 1 missed)**.

Verified by read-only `scripts/probe-pr-stats.ts`, which calls `loadPrStats` AND
re-derives every figure from raw rows, asserting the two agree — **44 memberships,
0 disagree**. It builds no fixtures, per
[[probe-fixtures-must-match-production-shape]]. The scoping is proven by the same
run: Alice reads 100% at Atlas and "—" at her three other rosters.

Still unbacked on that card: **`kpiScore` is a cosmetic 0** and nothing reads it —
the Warn/Suspend flags come from ratings, wages from the tier rate card. The
A/B/C `kpiTier` beside it IS real (`agency_pr.kpi_tier`, migration 0089) but is
display-only grading: it feeds no wage, warning or ranking.

Related: [[auto-assign-100-row-clamp]] (audited in the same slice).
