---
name: monday-anchored-collection-invoice
description: One SETTLED collection_invoice row is Monday-anchored (20–26 Jul) — re-running the weekly job for either overlapping Sun–Sat week can double-bill Velvet 23
metadata: 
  node_type: memory
  type: project
  originSessionId: 820b8cc0-4364-419b-8fc0-e9d59b7e8049
  modified: 2026-08-12T01:50:58.176Z
---

The code is uniformly Sun–Sat (12 Aug 2026). The DATA is not, and code and rows are separate
claims.

A read-only audit of every `week_start`/`week_end` column in schema `main`
(`apps/backend/src/scripts/probe-week-start-dow.ts`, which discovers columns from
`information_schema` so no table can look clean by never being checked) on 12 Aug 2026 found
**2 of 16 dated week values disagree**, and both belong to one row:

- `main.collection_invoice` id `57f8cbd2-3389-414d-9fd4-7ac1eadb7c76`
- Velvet 23 (outlet `ed739c13…`), agency `c30fcd15…`
- **week_start 2026-07-20 (Mon) → week_end 2026-07-26 (Sun)**, RM 700.00
- `created_by=weekly-payout-job`, issued AND `status=settled` on 2026-07-30

`payment_voucher` (6 rows) and `penalty_charge` (1 row) are all correctly Sun/Sat.

**Do not "fix" it by moving the dates.** It is a settled financial record written by the job
before the payroll anchor moved to Sunday (3 Aug 2026, owner's instruction). The repository
already encodes the principle — *"once an agency has issued an invoice, a later job run must
not move the number underneath them"* (`draftForWeek`, `onConflictDoNothing`, deliberately no
update).

**The live risk is double-billing, not the stale dates.** The unique index is
(agency, outlet, week), so this Monday row does NOT collide with either Sun–Sat week it
straddles. Re-running the weekly payout for **19–25 Jul** or **26 Jul–1 Aug** would draft a
NEW Velvet 23 invoice covering work this settled RM700 already billed (20–25 Jul overlaps;
Sun 26 Jul sits inside it). Check for this row before re-running the job over late July.

Instrument caveat: only 8 dated rows exist across the three tables, so this proves the tables
that HAVE data — it cannot speak for volumes not present. Re-run the probe after any bulk
import.

The only writer is `scheduler/weekly-payout.job.ts` via `previousCompleteWeek()`; no API
accepts a client-supplied `weekStart` for writes (the collection-invoice controller uses it
only as a query filter). So this is legacy, **not an open door** — new rows cannot be
Monday-anchored.
