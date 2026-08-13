---
name: innocenz-tier-is-per-membership
description: "PR tier lives only in agency_pr.tier and is per-agency — never one global tier, never a literal in a screen"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2518481e-d8d4-4ce6-87bc-8a3e7c965b3a
  modified: 2026-08-06T07:18:43.903Z
---

A PR's tier lives in exactly one place: `main.agency_pr.tier` (`pr_tier` enum). It is a
**membership** fact, so one PR can be `tier_3` at Atlas and `tier_1` at Delta and both are
correct. Verified 6 Aug 2026 — Vicky (`93ea08b0-1911-43c1-8b32-c9c27b2c22b5`) has exactly
those two rows, and `tier_5` exists nowhere in the database for her even though her phone
profile printed a hardcoded `TIER V`.

**Why:** the owner asked to make every screen agree ("no any different data just take form
the same database"). Flattening tier to one value would destroy the ability to grade a PR
differently per agency — the divergence to hunt is a screen showing a tier that is in no
`agency_pr` row at all, not two agencies disagreeing.

**How to apply:** any surface showing a tier must read `agency_pr.tier` for a named agency.
When approved memberships agree, show one badge; when they differ, name each agency rather
than picking a winner. `GET /agency/pr-links` returns `tier` per link (added 6 Aug 2026, no
migration — the join was already there). Never hardcode a tier label. Related:
[[innocenz-tier-rate-card]], [[innocenz-database-rules]], [[innocenz-payee-name-format]].

Sibling trap in the same family: `managedPrFromBackend` seeds `rating: 0` as a placeholder
for "the endpoint returns no rating". Guard with `recordRating`, never `!= null`, or every
unrated PR wears a `0★`.
