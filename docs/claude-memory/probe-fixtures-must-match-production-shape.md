---
name: probe-fixtures-must-match-production-shape
description: "A probe that writes its own fixtures must write them in the PRODUCTION shape or it certifies the bug; plus the two join facts it hid — shift_assignment.pr_id IS user_id, and one person holds an agency_pr row PER AGENCY"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: dfdb1811-e54e-45c2-9428-a1df9dcb921d
  modified: 2026-08-12T01:01:33.163Z
---

11 Aug 2026. Shipped a per-tier headcount cap on `shift-assignment` and "proved"
it with a probe that seated PRs inside a rolled-back transaction. The probe
reported `REFUSED TierFullError` and I called it verified. **It was broken.**

The probe wrote `pr_id = agency_pr.id`. The code joined on `agency_pr.id`. Real
rows carry `pr_id = user_id`. The probe manufactured the one shape that made the
buggy join match — it was testing the code against itself.

**Why:** after migration 0089 `shift_assignment.pr_id` **IS the user id** — the
column kept its old name. Live: **0 of 43** rows match `agency_pr.id`, 43/43
match `agency_pr.user_id`. Joining on `.id` gave every staffed PR a NULL tier, so
all of them fell into the "unnamed" bucket; on the 35 shifts whose demand sums to
`quantity`, unnamed is 0 — the cap would have **refused every assignment**.

**Second fact, found only after fixing the first:** a person holds an `agency_pr`
row **per agency** (4 of 7 users have more than one), so `pr_id = user_id` ALONE
multiplies rows — one assignment counted several times (`already has 3/2 Tier I`
from a single extra PR). The agency predicate belongs in the **join key**:
`eq(agency_pr.agency_id, shift_assignment.agency_id)`. Same family as
[[outlet-read-a-foreign-agencys-tier]] — a join that narrows the ROWS but not the
FACT.

**How to apply:** when a probe constructs rows, first ask what the PRODUCTION
writer puts in each column and copy that exactly — read the controller's insert,
don't infer it from the schema or from what the code under test reads. A cheaper
check that would have caught this in one query: count how many real rows the new
join actually matches (`0 of 43` is unmissable) before trusting any behavioural
result. Related: [[absent-evidence-is-about-the-instrument]] (the instrument was
wrong there too, but it FAILED OPEN here — a green result, not a blank one),
[[green-signals-that-lie]], [[confirm-before-asserting]].
