---
name: pr-spend-excluded-commission
description: "The outlet's PR spend showed wages only under a label reading 'PR wages & commission' — and the obvious fix (widen totalCost) would have broken the reconciliation banner, because collection_invoice bills pay_amount alone"
metadata: 
  node_type: memory
  type: project
  originSessionId: 121dc04c-c50c-4d26-84cc-8792fe6d88e7
  modified: 2026-09-03T01:47:25.429Z
---

**Fixed 3 Sept 2026.** Outlet → Reports headlined *"RM 5,950.00 floor sales − RM 5.56 PR wages &
commission"* and a **100% margin**. The RM 5.56 was a real wage (pro-rated over an 11-second
clocked session — see [[wage-is-flat-cutloss-unbuilt]]). What was missing was **RM 777.50 of
commission** Vicky earned on that night's approved receipts. Correct spend RM 783.06, margin 87%.

**The label had been telling the truth for months and nobody read it as a claim.** `t.reports.formula`
already said "PR wages & commission" while `reportCostByPrDay` summed `shift_assignment.pay_amount`
alone. A string that names two components beside a number built from one is a testable assertion —
treat a label as a spec, not decoration. Same family as
[[receipt-status-cannot-say-disputed]] and [[history-read-never-opened-shift-sale]].

## The trap: the obvious fix breaks a different consumer

`WeeklyReport.totalCost` had TWO readers, and they wanted different numbers:

- `OutletSalesDashboard` — wants the venue's whole PR spend.
- `OutletReconciliationBanner` — compares the agency's **`collection_invoice`** against the outlet's
  own records. That invoice is `sum(sa.pay_amount)` **and nothing else**
  (`collection-invoice.repository.ts:74`, `status = 'completed'` only).

So folding commission into `totalCost` would have raised a **phantom RM 777.50 variance every week**
on every venue with receipts — the exact false-alert class `use-outlet-sales-report.ts` already
carries a warning about for pooled outlet scope. Fix: the row carries `cost` (wages) and
`commission` apart; the hook exposes `totalCost` (the sum, for display) **and** `totalWages` (for the
banner). Before widening any shared money total, **list its readers and ask which question each is
asking** — [[dont-back-outlet-sales-vs-pv]] is the same lesson from the other direction.

## The SQL detail that matters

Commission is a **correlated subquery inside `sum()`**, not a join:

```sql
coalesce(sum((
  select coalesce(sum(l.amount), 0)
    from main.payment_voucher_line l
    join main.payment_voucher_receipt r on r.id = l.receipt_id
   where r.shift_assignment_id = "shift_assignment"."id"
     and r.status in ('approved','verified')
     and l.component in ('drink_commission','tip_commission')
)), 0)::float8
```

**Joining `payment_voucher_line` fans the assignment row out once per receipt line, and the
`sum(pay_amount)` beside it then bills a night's wage once per drink.** Prove the absence of fan-out
with a control query that does no join at all — `_probe-pr-spend-commission.ts` does exactly this
(Emhub wages RM 16,131.11 both ways). The subquery needs no scope terms: the receipt hangs off
`shift_assignment_id`, so it inherits the outlet/agency/date filter of the row it belongs to, which
is also what stops it crossing agencies ([[cross-agency-voucher-contamination]]).

`l.amount` on a receipt line is the **commission**, not the gross — the gross is field 3 of the
packed `ref`, and that is what `shift_sale` is built from. Gated on `approved`/`verified` to match
`recomputeShiftSale`, so a night's revenue and the commission earned against it move together.

## Overtime went in the same day (owner asked)

PR spend is **wage + commission + APPROVED overtime**. OT is read from
`shift_assignment.overtime_amount` — NOT from the `component='ot'` voucher line — because the
column sits on the row already being aggregated, so it needs no join and cannot fan the wage sum
out. The two records agree by construction (`overtime-line.ts` computes the number once and writes
it both places; 6/6 live rows identical, checked 3 Sept 2026).

⚠️ **Gate on `overtime_status = 'approved'`, never on the amount being present.** A REJECTED
claim also carries a frozen amount (the 279-minute claim of 2026-08-03, see
[[overtime-bounded-by-clocked-time]]), so `sum(overtime_amount)` alone bills a venue for overtime
its agency refused. Overtime is never auto-paid — [[ot-not-auto-paid]].

**Live data does NOT discriminate that gate**: every non-approved row happens to hold 0, so
removing the gate changes no total today and a green check would prove nothing
([[ci-instruments-that-passed-unconditionally]]). It was proven against a synthetic VALUES set
instead — approved 100 / rejected 50 / pending 25 / null → gated returns **100**, ungated 175.
`_probe-ot-sources.ts` holds that check.

The label **"PR wages & commission" was left alone on purpose**: overtime pay IS wages, so the
string still describes the sum honestly.

## Deductions are a PRIVACY rule, not a bucketing choice

**“Ignore the deductions — the outlet is not supposed to see them” (owner, 3 Sept 2026).** A
`component='deduction'` line is a PENALTY the agency levied on its PR ([[pr-penalty-rules]]), so it
is the PR’s discipline record. `ShiftCostPrDayTotals` is served to OUTLET callers, which makes
excluding it a disclosure rule and not merely a question of which bucket it belongs in.

⚠️ **The component filter must stay an ALLOW-list** (`in ('drink_commission','tip_commission')`).
A NOT-IN list — “everything receipt-backed except deduction” — discloses the next component anybody
adds, and it would type-check. Same shape as [[org-scope-guard-family]]: name what is allowed.

Today the guard has nothing to catch: the one live deduction line carries **no `receipt_id`**, so it
cannot reach the (shift, PR) join the report uses at all. That means the exclusion is currently
**unexercised by live data** — do not read a green probe as proof it works
([[absent-evidence-is-about-the-instrument]]). It is the guard that would hold if a penalty ever
gained a receipt.

Checked the same day: **nothing in the outlet portal references deductions or penalties at all**
(zero hits across `agency-portal/components/outlet` and `routes/outlet`), and voucher data sits
behind `requireRole('admin','agency')` — everything mounted ABOVE that guard is PR-scoped
`/mine/*`. A full outlet-privacy sweep was NOT done.
