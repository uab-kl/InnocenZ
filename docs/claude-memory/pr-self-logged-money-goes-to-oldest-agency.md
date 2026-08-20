---
name: pr-self-logged-money-goes-to-oldest-agency
description: "UNFIXED — a PR's self-logged wages and receipts are written to their OLDEST agency's voucher, not the agency whose shift they worked; the weekly job then bills the same shift TWICE"
metadata: 
  node_type: memory
  type: project
  originSessionId: 78096242-e372-405f-899d-ee641f77fe03
  modified: 2026-08-20T10:24:40.044Z
---

> ✅ **THE WRITE PATH IS FIXED** (20 Aug 2026, same day, before it could fire). `addMyLine`
> AND `addMyReceipt` now call `resolveMoneyAgencyId`, which answers from the WORK: the named
> assignment first (check-out sends it as `dedupeRef`, receipts as `assignmentId`), else the
> PR's bookings on that DATE when they are all one agency, else their single approved
> membership (`PrRepository.listApprovedAgencyIds`, new), else a **409 refusal** — a guess
> here is indistinguishable from a correct answer and silently moves somebody's pay.
> Proved live: `getById(0c00ab15).agencyId` = Why We Met where the old path said Atlas; the
> ambiguous 409 fired and wrote nothing. ⚠️ **The four READ-side findings below are still
> open** — signing, the to-do, disputes and history.

Found 20 Aug 2026 by an audit of the PR-side payment voucher. Same root cause as the
assign-path bug fixed that morning
([[oldest-membership-was-the-agency]]), in three places that fix never reached: *a fix named by
its symptom does not find its siblings* ([[fix-named-by-symptom-hides-siblings]]).

## The fault

`payment-voucher.controller.ts:615` — `resolvePr` calls `prRepository.getByUserId(userId)` with
**no agency**, and the parameterless form takes the OLDEST membership
(`pr.repository.ts:278`, `orderBy(asc(AgencyPrTable.createdAt))`). That `pr.agencyId` is handed
straight to both money-write paths — `addMyLine` (`:1725`) and `addMyReceipt` (`:1818`) — as
`getOrCreateCurrentWeekDraft({ agencyId: pr.agencyId })`.

The repository is **correctly agency-scoped**; the agency id ARRIVING is the wrong one. That is
why `tsc`, `check:drift` and a reading of the SQL all look clean.

## Worse than a mis-filing — THE SAME SHIFT IS BILLED TWICE

The PR's money lands on agency A's voucher. At week close the generator
(`payment-voucher-generator.ts:133`) asks `existsForPrWeek(B, prId, week)`, finds **no** B
voucher — the money went to A — and **creates one** carrying the same wage line. Two agencies
are now billed for one shift, and the PR's phone sums across vouchers
(`payment-voucher.controller.ts:1421`), so she is shown **RM 1,200 for a RM 600 shift**.

## The live trigger, and why nothing has caught it yet

Zero users currently hold two vouchers in one week, so `mergeWeekVouchers` and every
merged-week path **has never executed against real data**. Nothing is contaminated today only
because every receipt so far belongs to an Atlas shift and **Atlas happens to be the oldest
membership** for Alice, Vicky and Haziq. Accidentally fine, not correct.

⏰ **Alice has exactly one assignment in the current week: Why We Met Agency, 18 Aug 2026,
JK House, RM 600, still `assigned`, not checked in.** Her oldest membership is Atlas (20 Jul);
WWM is newer (12 Aug). The moment she checks out this fires — and fixing it afterwards means
repairing money rows, not just code.

## Fix (shape agreed, not yet applied)

Resolve the agency **from the work, not from membership age**. `addMyReceipt` already validates
`assignmentId` as the PR's own (`:1868-1879`) — read `shift_assignment.agency_id` off that row.
`addMyLine` needs `assignmentId` added to `CreatePrReceiptLineSchema`; the check-out seal
already knows it and sends it as `dedupeRef`. Where no assignment is available, REFUSE rather
than guess whenever `agency_pr` holds more than one approved row.

## Four more from the same audit, also unfixed

- **CRITICAL — the PR signs one voucher while the screen shows two agencies' money.**
  `PvDetailScreen.tsx:206` discards the `pvId` prop for `lastWeek?.voucherId` (the NEWEST
  voucher) and `:217` shows the MERGED net. She signs a RM 500 document attesting RM 1,500, and
  the other agency's voucher becomes **unreachable** (`:307` returns null for any other id).
- **HIGH — only one voucher is ever offered for signature** (`awaiting-pv.tsx:67`): the to-do
  gates on the headline's `status`, so a `sent` voucher sitting behind a `pending_review` one is
  never surfaced at all.
- **HIGH — a dispute posts to the headline voucher** (`PaymentScreen.tsx:768`) whichever
  agency's line was tapped; the server stores `receiptId` with no parent check (`:3530`), so it
  writes a **RM 0.00** dispute onto the wrong agency's voucher and flips it to `disputed`.
- **MEDIUM — PR payment history carries no agency at all** (`listHistoryForPr`,
  `payment-voucher.repository.ts:705`, no `AgencyTable` join), so two vouchers render with
  identical week and outlet labels.

**Cheapest unlock:** put `voucherId` on each line DTO and `agencyName` on `PrHistoryVoucher` —
that one payload change unblocks the client half of all four.

## Verified CORRECT (do not re-investigate)

Reads fan out properly — `listWeekVouchers` (`:668`) has no agency filter and returns every
voucher for the week with the agency name joined per row. The week TOTAL is right. Signing is
voucher-scoped server-side (`ownsMineVoucher`, `:619`) — the bug is entirely the client's choice
of id. Dispute ARITHMETIC is voucher-scoped. The PV card's agency name is per-voucher, **not**
an `agencies[0]` hoist — that bug existed only in `AgencySchedulePanel` and is fixed. The weekly
generator and overtime both use the shift's own agency.
