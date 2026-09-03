---
name: receipts-dont-feed-outlet-sales
description: "BUILT AND VERIFIED 10 Aug 2026 — PR receipts now feed shift_sale, so outlet floor sales is no longer always RM 0.00. Services have their own service_sales_rm bucket (0109). Carries the recompute-not-increment rule and the category-vs-kind trap."
metadata: 
  node_type: memory
  type: project
  originSessionId: 4b6685fb-5262-48c6-8250-a83ea0658ef8
  modified: 2026-08-10T01:46:40.636Z
---

# Receipts feed payroll — and now the outlet's sales too

> ✅ **BUILT AND VERIFIED 10 Aug 2026.** Everything below describes the shipped
> design; the "Two ledgers that never touch" framing is the BEFORE state, kept
> because it explains why the code is shaped this way. What shipped:
> migration **0109** (`service_units`, `service_sales_rm`), the leaf
> `features/shift-sale/shift-sale-from-receipts.ts`, **7** wired mutation sites,
> `scripts/backfill-shift-sale-from-receipts.ts`, and a third Services tile +
> column on the Floor Sales breakdown.
>
> Proof: live `GET /shift-sale/report` as the real Emhub owner, 2–8 Aug →
> revenue **RM 11,660.00**, cost RM 9,735.55, **net +RM 1,924.45**, matching the
> pre-build projection to the cent. Backfill: 6/6 pairs, 0 failed, 0 rows where
> `total <> drink+tip+service`.
>
> ⚠️ NOT visually clicked through — the Browser pane could not composite frames
> that session. The React layer is typechecked but unviewed.
>
> Two latent bugs fixed while wiring, both of which this feature would otherwise
> have turned into silent money movement:
> 1. `updateMyLine`'s `encodeRef` **dropped the category** (field 5), so any
>    quantity edit reclassified a service line as a tip.
> 2. `deleteMyLine` must resolve the `(shift, PR)` key BEFORE deleting —
>    removing a receipt's last line removes the receipt, after which nothing
>    resolves and the deleted money would stand as revenue forever.

Two ledgers that never touch. Verified live 6 Aug 2026 against `innocenz-test`.

- **PR receipt** → `POST /payment-voucher/mine/receipts` → `payment_voucher` → `payment_voucher_receipt`
  → `payment_voucher_line`. The `payment-voucher` feature has **zero references to `ShiftSaleTable`**.
- **Outlet floor sales** → `shift_sale`, read by `use-outlet-sales-report.ts` (the Reports page).

**`shift_sale` has no writer anywhere in either frontend.** `logShiftSale`
(`apps/web/src/services/shift-sale/index.ts`) has **zero callers**; `apps/mobile` never
mentions `shift-sale` at all. The only route is `POST /shift-sale`, gated
`outletOwnerOrOpsIfMember` — an OUTLET write, and no screen calls it. So floor sales
reads RM 0.00 forever, and net sales is a pure negative of PR wages. This is not a data
problem; it is a missing write path. Same shape as
[[post-job-read-demo-menu-not-backend]]: the read was built, the write never was.

**The gross sale IS captured, just not as a column.** `encodeRef(kind, source, sales, dedupe, category)`
packs it pipe-joined into `payment_voucher_line.ref`; `amount` holds the COMMISSION.
So the data to fill `shift_sale` already exists on every receipt line.

## Three facts from the live DB that decide the design

1. **`receipt_date` is unusable as `sold_on`.** All 10 live receipts print `2026-06-16`
   while their shifts span 29 Jul – 6 Aug. Use `shift.shift_date` — which is also what
   `reportCostByPrDay` groups cost by, so any other choice puts revenue and cost on
   different bars. See [[shift-overlap-rules]] for why an overnight 22:00–04:00 slot makes
   the paper's date and the shift's date genuinely different days.
2. **Attribution is not a problem** — 10/10 receipts carry `shift_assignment_id`, so
   `shift_sale.shift_id NOT NULL` is satisfiable with no schema change.
3. **Services dominate gross, and ARE counted** (decision 1) — `tips/service` RM 11,400
   vs `drinks` RM 270 and `tips/tip` RM 200. So services are ~97% of floor sales, and the
   whole feature's output is really a services number with drinks and tips as rounding.
   Projection for Emhub 2–8 Aug (status-gated per decision 2): revenue RM 11,660 against
   RM 9,735.55 of wages = **net +RM 1,924.45, ~17% margin** — the page goes positive.
   Excluding services instead would have been RM 260 revenue, −RM 9,475.55.

   ⚠️ **`kind` cannot separate a tip from a service.** `receiptKindForItem` maps category
   `service` → kind `tips`, so kind-level logic sees one bucket. Category (field 5 of
   `ref`) is the only discriminator — which matters for the OPEN sub-question below, and
   would matter enormously if decision 1 is ever reversed again. One live line has an
   EMPTY category (`kind='drinks'`, RM 30); an empty category on a TIPS-kind line would
   be undecidable — none exist today, but the write path should refuse or log, not guess.

## Decisions (user, 6 Aug 2026)

| # | Question | Answer |
|---|---|---|
| 1 | Do service entitlements count as floor sales? | **YES — final answer 10 Aug 2026.** Excluded earlier the same day, then REVERSED once the arithmetic was on the table. Floor sales = drinks + tips + services. Still keep it a one-line filter |
| 2 | Gate on receipt status? | **YES** — count `approved` + `verified` only; add the status-transition hook |
| 3 | Trust the phone's posted `sales`, or re-derive from the outlet catalogue? | **TRUST IT** — do NOT re-derive |
| 4 | Guard against a future outlet-side sales writer? | **No such page will exist** — Reports IS that page, so PR-derived is authoritative and single-writer |

Decision 3 knowingly promotes a field the schema comments call "kept only for display"
into an accounting number set by the PR's phone. That was the user's call after the
trade-off was stated — do not relitigate it, but it is the thing to look at first if
outlet revenue ever reads implausibly.

## The build (NOT started — scheduled 7 Aug 2026 or later)

**Recompute, never increment.** `ShiftSaleRepository.upsert` already REPLACES totals on
the `(shift_id, pr_id)` unique key. So: resolve assignment → sum ALL this PR's
receipt-backed lines for that shift → upsert the whole row. Edit/delete/re-approval fall
out free, re-runs are no-ops, and the backfill is the same function. An incrementing
design needs a compensating write on every mutation path and drifts the first one missed.

Four call sites — missing any one silently desyncs revenue from the voucher:
`addMyReceipt`, `updateMyLine`, `deleteMyLine`, and the agency's add-missing-line path.
Plus the receipt approve/verify transition, because of decision 2.
**`addMyLine` is deliberately OUT** — it carries no assignment id (only a `dedupeRef`),
so it cannot be attributed to a shift; it is the wages/check-out seal door.

Also needed: extend `getOutletForAssignment` (returns only `{outletId, outletName}`) to
also yield `shiftId`, `agencyId`, `shiftDate`. Put the mapper in a LEAF module so the PV
feature doesn't import the shift-sale feature wholesale — see
[[import-cycle-killed-agency-portal]] for what that costs. A failure must log and NOT
fail the PR's log; a receipt must never 500 because the revenue mirror hiccuped.

Bucket mapping: category `drink` → `drink_sales_rm`, category `tip` → `tip_sales_rm`,
category `service` → **OPEN — see below**, `wages`/`others`/`ot` excluded.

**SETTLED 10 Aug 2026: services get their OWN bucket — add `service_sales_rm`.** Folding
them into `tip_sales_rm` was rejected: services are ~97% of floor sales, so reporting
them to an outlet as "tips" would misstate a money screen, and the two could never be
split again without a backfill. This makes the change a 5-layer one, all of which must
land together or the screen half-reports:

1. **Migration** — `service_sales_rm numeric(12,2) NOT NULL DEFAULT '0'` (+ `service_units`
   integer if units are wanted, to match the drink/tip pairs). Hand-author the `.sql`:
   see [[migration-journal-corrupt]] — `drizzle-kit generate` CANNOT run here and the
   journal `when` must exceed the live max. [[backend-migrations-shared-db]] for the
   bare-`migrate` rule on the shared DB.
2. `ShiftSaleTable` model + `ShiftSaleInsertType`.
3. `reportByDay` projection and the `ShiftSaleDayTotals` type — it sums each column
   explicitly, so a new column is invisible until added there. Ditto `reportByPr` if
   per-PR sales are wanted.
4. `use-outlet-sales-report.ts` — `FloorBreakdown` type, `buildFloorBreakdown` (add the
   service row), and **`total_sales_rm` now = drink + tip + service**.
5. The Floor Sales breakdown UI — a third row beside drinks and tips.

**Set `total_sales_rm = drink + tip + service` on every write.** The screen reads TWO different
definitions: the "FLOOR SALES" card sums `drink_sales_rm + tip_sales_rm`
(`use-outlet-sales-report.ts` `buildFloorBreakdown`), while the "NET SALES SO FAR"
headline and the per-night bars use `total_sales_rm` (`buildReport`). `total_sales_rm` is
a STORED column summed independently in `reportByDay` — nothing derives or constrains it.
Write them inconsistently and the two cards disagree with no error anywhere.

No column is needed to preserve the excluded services: the gross stays in
`payment_voucher_line.ref` forever, so switching decision 1 on later is a filter change
plus a backfill re-run. Do NOT add a `service_sales_rm` column speculatively.

## Knock-on

Once this lands, `reportByPr` starts returning real per-PR sales. Worth ranking
"Top performing PRs" on that in the same pass — today it ranks by
`shift_assignment.pay_amount`, i.e. what the outlet PAID them, so the label overstates
what the number means.

**"+0% vs prior" is FIXED (10 Aug 2026)** — it was never blocked on a backend
endpoint. The old comment claimed a comparison endpoint was needed, but
`use-outlet-sales-report` fetches the outlet's WHOLE history in one call
(`REPORT_FROM` 2000 → `REPORT_TO` 2100) and slices client-side, so the prior
window was already in memory. Now `wowGrowthPct` is `number | null`:
- A **week** shifts back exactly 7 days, never by its own length — the current
  week is capped at today, so shifting a 4-day Sun–Wed window by 4 would land on
  Wed–Sat of the prior week and call midweek-vs-weekend "growth".
- **Null when the prior margin is ≤ 0**, because a percentage needs a positive
  baseline. The demo's old fallback returned `100` in that case — pure
  fabrication. Live proof: Emhub's prior week margin is −RM 4,270.00, so the old
  formula would have badged **"+100% vs prior"**; it now reads "No prior data".
