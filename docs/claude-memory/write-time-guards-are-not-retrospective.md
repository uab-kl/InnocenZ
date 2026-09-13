---
name: write-time-guards-are-not-retrospective
description: "11 live commission lines sat above the rate card and looked like fraud — they were Tier III rates written while the PR was Tier III. Mutable reference data means a money guard checks WRITES only, never history."
metadata:
  node_type: memory
  type: project
---

**Before calling stored money wrong, ask whether the thing you are measuring it against has
moved.** Written 13 Sep 2026, while closing the hole where a PR's phone supplied the
commission its own voucher line paid.

## The near-miss

A probe compared every `payment_voucher_line` of kind drinks/tips against the rate card and
found **11 of 63 above the ceiling, worst by RM 60**. That reads as tampering.

Opening the rows: drinks at **12%**, tips at **17%**, against a card that now says 10% and
15%. Those are **Tier III's** rates — and the PR is **Tier I today**. Both inputs are
mutable:

- `outlet_tier_rate` / `shift_pay_tier` are edited by the venue whenever it likes;
- `agency_pr.tier` is **per membership** and changes when an agency re-grades someone.

Every one of those lines was honest when it was written. A "cleanup" that recomputed them
would have rewritten real people's pay.

## The rule this leaves

A guard over money whose reference data is mutable is a **write-time** guard:

- **At write time** the current card and the current tier ARE the applicable ones, and the
  client derived its figure from the same card the server serves it
  (`/shift-assignment/mine` then `mergeRate`). An honest log can never trip the check.
- **Retrospectively** the same comparison is meaningless, because neither input is the one
  that applied.

`commissionCeilingRm` in `payment-voucher.controller.ts` carries this in its own comment. Do
not add a backfill, a nightly reconciliation, or an "audit the old rows" pass against it.

If history really must be auditable, the fix is to **store the percentage on the line** at
write time — not to re-derive it later from data that has moved.

The wage half of the same change makes the point from the other side: the server's sealed
`shift_assignment.pay_amount` became the authority, but ONLY where `pay_rule` says check-out
really sealed it. Without that flag the column still holds an assign-time forecast, and 8 of
17 live rows were exactly that — trusting them would have underpaid people.

Distinct from [[voucher-never-checked-against-source]], which is about a voucher never being
compared to its source records at all; this is about not running that comparison *backwards*.
Related: [[innocenz-tier-rate-card]], [[innocenz-tier-is-per-membership]],
[[confirm-before-asserting]].
