---
name: history-read-never-opened-shift-sale
description: "FIXED 27 Aug 2026 — every History money breakdown read RM 0.00 Received because the read side never opened shift_sale, though the receipts were there all along. Services are the MAJORITY bucket (84% of gross), so drinks+tips alone would have been a new wrong number."
metadata: 
  node_type: memory
  type: project
  originSessionId: 1e4f14c9-5c93-422c-84dd-492c00edc0a7
  modified: 2026-08-27T07:00:42.978Z
---

# The receipts were in the database the whole time — nothing read them

**Symptom (owner, 27 Aug 2026):** the agency History "Earned breakdown by outlet"
showed **TOTAL RECEIVED RM 0.00** beside **TOTAL PAYOUT RM 6,791.11** for Vicky,
while the Receipts panel one screen away listed her verified receipts at
RM 322.50, RM 472.50, RM 55.00 … "help me check why these 2 are not linked".

**It was not a missing write.** `shift-sale-from-receipts.ts` mirrors every
approved receipt onto `shift_sale` and has done since 10 Aug — see
[[receipts-dont-feed-outlet-sales]]. Vicky alone had **9 rows, RM 20,810 gross**,
the newest written the day before. The break was one layer higher:

> `shiftHistoryRowFromAssignment` built each row from the **assignment alone**
> and hardcoded `totalDrinks: 0, totalTips: 0`, never setting `drinkSalesRm`.
> `shiftHistoryTotalReceived()` therefore could only ever return 0.

**The stale comment is why nobody re-checked.** That function's docstring said
*"the backend has no per-shift sales data, so those parts stay 0"* — true when it
was written, false since the bridge shipped. A comment asserting why something is
safe ages into a reason not to look. Same lesson as [[audit-entries-are-leads]].

Confirming it was systemic: across the whole web app **only**
`use-outlet-sales-report.ts` imported `@/services/shift-sale`. All three history
hooks mentioned no sales field anywhere.

## Services are the MAJORITY bucket — never ship drinks+tips alone

Checked live before wiring, because the fix looked like a two-line join:

| bucket | receipt lines | gross | commission |
|---|---|---|---|
| **service** | 23 | **RM 25,500 (84%)** | RM 3,991 (89%) |
| drink | 18 | RM 4,620 | RM 412.50 |
| tip | 7 | RM 350 | RM 55.50 |

`ShiftHistoryRow` had only `drinkSalesRm` + `totalTips`. Wiring those two would
have printed **RM 1,100 against a real floor total of RM 3,200** — a plausible
wrong number replacing an obviously-zero one, which is worse. `serviceSalesRm` is
now carried end to end and the tile renders **only when > 0**, so venues with no
services keep the two-tile layout.

⚠️ **A PR never sees the word "service".** `ScanScreen` has two pages — Drinks
(`category: 'drink'`) and **Tips** (`'service'` + `'tip'` together) — and
`receiptKindForItem` packs kind `tips` for both. The split survives only in the
receipt line's own category segment (field 5 of `ref`), which is what
`shift_sale.service_sales_rm` derives from. Bucket on **category, never `kind`**.

⚠️ **An item named "Tips" is filed as `service` at Emhub Testing**, while the
identically-named RM 50 item at JK House and Velvet 23 is `tip`. The menu editor
and the DB column both default to `'service'`, and nothing checks a name against
its category — so an item added to the wrong list lands there silently.
Unresolved; ask before "correcting" it.

## The join, and the one subtlety in it

Both hooks fetch `GET /shift-sale` and index by `(shiftId, prId)` — `shift_sale`'s
own unique key, and `shift_assignment.pr_id` holds the same user id, so it is ids
end to end with no name matching (cf. [[probe-fixtures-must-match-production-shape]]).

- **Agency** bounds the fetch to its existing 365-day window — the shifts query
  uses the same one, so a sale outside it has no row to attach to.
- **Outlet** deliberately does NOT date-filter, because its assignments query has
  no date bound either; a narrower window would leave older rows reading RM 0.00.
- `drinkSalesRm` passes `undefined` with no sale row and the **number 0** with
  one: `resolveShiftDrinkSalesRm` falls back to units × RM150 only on ABSENCE, so
  a real RM 0.00 must arrive as 0, not as a gap.
- **Payout is untouched.** Service RM never reaches `calcShiftPayout` — the PR's
  cut is sealed on `payment_voucher_line.amount` at approval, and re-deriving it
  from a rate card would be a rival figure for money already committed.

## Verified live, both portals

Agency `/agency/history`: Vicky **RM 0.00 → RM 20,810.00**, matching the DB sum
exactly; Emhub RM 15,460 / JK House RM 5,350 / Velvet 23 RM 0.00 (1 shift, no
receipts). Breakdown = 3 lines, RM 3,360 + RM 100 + RM 12,000. 中文 renders 服务.
Outlet portal shows RM 15,460 for the same PR — its own venue only, so scoping
holds. A shift with no services still renders 2 lines.

`tsc` was **proved able to fail** first (a deliberate `string`→`number` break
raised TS2322 at the exact line) — see [[ci-instruments-that-passed-unconditionally]].
