---
name: cross-agency-voucher-contamination
description: "🔴 A PR in 2+ agencies had one agency's money written onto the other's voucher — the week lookups had NO agency term. Re-keyed in 0129; the index alone would NOT have fixed it."
metadata: 
  node_type: memory
  type: project
  originSessionId: 37d8edb4-59af-4c3d-9c67-eb46b03b2bbe
  modified: 2026-08-20T04:46:02.370Z
---

**Found 20 Aug 2026.** An audit note claimed the only fault was "the weekly generation run
crashes on a unique constraint, but money is never mixed". **The reassuring half was wrong**, and
that is the lesson: the constraint was the *loud* symptom of a *silent* query bug.

## What was actually true

`payment_voucher_one_per_pr_week` was `UNIQUE (pr_id, week_start)` — no agency. Migration 0078's
own comment states the premise: *"A PR belongs to one agency"*. **A PR does not.** Membership is
`agency_pr`, one row PER AGENCY (see [[probe-fixtures-must-match-production-shape]]). Live on
20 Aug: **4 PRs held 2–4 agency memberships** (Alice 4, Vicky 3, Haziq 2, Arjun 2).

Three failure modes, only the third loud:

- **A (silent, worst)** — `getCurrentWeekDraft` / `getWeekVoucher` filtered on **PR + week only**.
  Agency B was HANDED agency A's open voucher and `addLine` wrote to it. Applies to **every**
  weekly money path: self-logged receipts, **approved overtime**, penalty charges.
- **B** — once A's voucher left the open statuses, B got *"already been sent … ask your agency to
  reopen it"* naming a document B cannot see or reopen. Permanently blocked.
- **C** — the INSERT race hit the index and killed the run. The only visible one.

## The trap

**Re-keying the index alone — the "one migration" fix — would NOT have fixed A.** A is query
scoping, not a constraint. Widening the key removes the crash that was the only thing making the
contamination visible. Index and lookups must move together, and the migration header says so.

## What shipped (0129)

- `0129_pv_one_per_agency_pr_week.sql` — creates the wide index BEFORE dropping the narrow one, so
  there is no unprotected instant. Duplicate-check keyed on the NEW triple.
- Optional `agencyId` 4th arg on both lookups; `getOrCreateCurrentWeekDraft` passes it. Optional
  **only** so PR reads stay whole-week — **every write path must pass it**.
- `existsForPrWeek` was **already** agency-scoped. The generator's guard was never the bug.
- New `listWeekVouchers` + `mergeWeekVouchers`: **ONE GRID, N PVs** (owner's call, 20 Aug) — lines,
  day statuses and disputes merge; vouchers stay separate because each agency signs and pays its
  own. Day status merge takes the **WEAKEST**: `approved` only if every voucher for that date says
  so. `net` is the week's SUM; `voucherId`/`voucherNo`/`status` are a back-compat **headline** only.
- Proven equivalent on 7 live weeks before applying — single-voucher output byte-identical.

⚠️ Anything that **signs, downloads or disputes** must walk `vouchers[]`. Acting on the headline
signs one agency's voucher and abandons the other. **The mobile UI still renders only the
headline** — that half is unbuilt.

See [[green-signals-that-lie]], [[audit-entries-are-leads]] (this note is another 1-for-1 case of
an audit entry being wrong in the reassuring direction), [[backend-migrations-shared-db]].
