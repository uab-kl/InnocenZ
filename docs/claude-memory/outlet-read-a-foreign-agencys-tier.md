---
name: outlet-read-a-foreign-agencys-tier
description: "A scope filter narrowed the ROWS but not the FACT — GET /pr for an outlet caller returned a PR once per agency_pr membership, so the web's id-keyed map kept a tier from an agency that never supplied that night (Vicky: Tier I instead of Tier III)"
metadata: 
  node_type: memory
  type: project
  originSessionId: efcdecd7-22b8-4478-b091-4c5c79c63a5e
  modified: 2026-08-06T07:55:01.378Z
---

**6 Aug 2026.** The owner spotted it from two screenshots: the agency Manage-PR grid said Vicky was
**Tier III**, the outlet Today card said **Tier I**. Both map `agency_pr.tier` through the same
`managedPrFromBackend`. Nothing was defaulting.

## What was actually happening

`PrRepository.listPaginated` iterates **`agency_pr` memberships**, and every row it emits claims
`id === userId`. That is safe for an agency caller — the branch is pinned to one `agencyId`, so an
account can only surface once. **An outlet caller is pinned to no agency at all**, so a PR with two
memberships came back **twice, under the same id, with two different tiers**, and the web does:

```ts
const agencyPrById = new Map(agencyPRs.map((p) => [p.id, p]));  // last row wins
```

Live data: Vicky = `tier_3` @ Atlas + `tier_1` @ Delta. Alice = `tier_2` @ Atlas + `tier_1` ×2. Atlas
supplied every Emhub night; Delta supplied none. The outlet was shown **Delta's grading of an Atlas
shift** — and `pagination.totalCount` was counting memberships, not PRs.

**The fix:** the outlet's `EXISTS` subquery already joined `shift_assignment.pr_id = agency_pr.user_id`;
it now also matches **`shift_assignment.agency_id = agency_pr.agency_id`**. An outlet sees the
membership of the agency that actually **supplied** the PR to its venue. One predicate.

## The lesson worth keeping

**A scope filter that narrows the ROWS but not the FACT lets a row through carrying someone else's
answer.** The tier was a real, correct `tier_1` — for a relationship the viewer had nothing to do
with. That is why it looked believable and why nobody suspected the query: nothing was null, nothing
was zero, nothing threw. Whenever a list is scoped by something OTHER than the org that owns the
fact being displayed, ask which relationship the displayed value belongs to.

Corollary: **`new Map(rows.map(r => [r.id, r]))` is a silent tie-break.** It cannot report a
conflict. If two rows can legitimately share an id, the collapse belongs in the query, not in a Map.

## Prove it, don't reason about it

Two read-only probes, both committed:

- `scripts/probe-outlet-pr-tier-and-history.ts` — the DB facts: every membership per account with its
  tier, which accounts hold more than one, **and whether the narrowing would DROP anyone** (zero
  assignments have an `agency_id` with no matching membership, so nothing is lost). Ask that question
  *before* adopting a narrowing, or the fix trades a wrong tier for a missing card.
- `scripts/probe-outlet-pr-list-tier.ts` — fires the real `GET /pr` + `GET /shift-assignment?status=completed`
  as an outlet owner. After: 4/4 PRs one row each (Alice II, Haziq I, Nurul II, Vicky III — matching
  the agency portal exactly) at both `owner@velvet23.my` and `emhub@emhub.test`.

Shipped alongside the Shift-history hydrator on the same card — see
[[outlet-panel-reads-demo-slices]]. Same family as [[org-scope-guard-family]]: a guard or filter that
checks a role or a venue but never the ORG that owns the row.
