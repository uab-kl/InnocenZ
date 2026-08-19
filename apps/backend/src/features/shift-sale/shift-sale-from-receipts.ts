/**
 * Mirrors a PR's RECEIPT gross onto the outlet's floor-sales row.
 *
 * The two ledgers were disconnected: a PR's scanned receipt writes
 * payment_voucher_line (payroll — `amount` is their COMMISSION), while the
 * outlet Reports screen reads shift_sale. shift_sale had no writer at all, so
 * floor sales read RM 0.00 forever. This is the bridge.
 *
 * RECOMPUTE, NEVER INCREMENT. `ShiftSaleRepository.upsert` REPLACES the row on
 * the (shift_id, pr_id) key, so every call re-derives that pair's whole total
 * from its lines. Edit, delete and re-approval therefore need no compensating
 * write, a repeat call is a no-op, and the backfill is this same function.
 *
 * Kept as a LEAF: payment-voucher imports only this file, and this file imports
 * only the db + the shift-sale repository. Nothing here reaches back into
 * payment-voucher, so no feature cycle can form.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { ShiftSaleRepositoryClass } from './shift-sale.repository';

const shiftSaleRepository = new ShiftSaleRepositoryClass();

/**
 * Buckets a receipt line by the CATEGORY packed in `ref` (field 5), never by
 * `kind` (field 1).
 *
 * `receiptKindForItem` maps category 'service' onto kind 'tips', so kind sees
 * tips and service entitlements as one thing — and services are ~97% of the
 * gross a PR logs. Bucketing on kind would silently merge that revenue into
 * tips, which is exactly the misstatement the separate service_sales_rm column
 * (0109) exists to prevent.
 *
 * Legacy lines carry an EMPTY category. Those fall back to `kind`, which is
 * unambiguous for drinks (kind 'drinks' only ever comes from category 'drink')
 * but NOT for tips — a legacy 'tips' line could be a tip or a service. It is
 * counted as a tip and logged, because dropping money silently is worse than
 * booking it to the bucket its own kind names. None exist today.
 */
const BUCKET_SQL = sql`
  case
    when nullif(split_part(l.ref, '|', 5), '') = 'drink' then 'drink'
    when nullif(split_part(l.ref, '|', 5), '') = 'tip' then 'tip'
    when nullif(split_part(l.ref, '|', 5), '') = 'service' then 'service'
    when split_part(l.ref, '|', 1) = 'drinks' then 'drink'
    when split_part(l.ref, '|', 1) = 'tips' then 'tip'
    else 'excluded'
  end
`;

/** Gross sale for the line — field 3 of `ref`. `amount` is the commission, not this. */
const GROSS_SQL = sql`coalesce(nullif(split_part(l.ref, '|', 3), '')::numeric, 0)`;

export interface ShiftPrKey {
  shiftId: string;
  prId: string;
}

interface RecomputeRow {
  shift_id: string;
  pr_id: string;
  user_id: string | null;
  outlet_id: string;
  agency_id: string;
  shift_date: string;
  drink_units: number;
  drink_rm: string;
  tip_units: number;
  tip_rm: string;
  service_units: number;
  service_rm: string;
  total_rm: string;
  legacy_tip_lines: number;
}

/**
 * Re-derives the (shift, PR) floor-sales row that `assignmentId` belongs to.
 *
 * Scoped by SHIFT + PR rather than by the assignment itself, because that is the
 * grain shift_sale is unique on — summing one assignment's receipts alone would
 * write a row that contradicts its own key. (Today the two grains coincide:
 * `shift_assignment` is itself UNIQUE (shift_id, pr_id). Keying on the pair
 * survives that constraint being relaxed; keying on the assignment would not.)
 *
 * Never throws: failing to mirror revenue must not fail the PR's receipt.
 */
export async function recomputeShiftSaleForAssignment(
  assignmentId: string,
  actor: string,
): Promise<boolean> {
  try {
    const target = await db.execute(sql`
      select shift_id, pr_id from main.shift_assignment where id = ${assignmentId}
    `);
    const key = target.rows[0] as unknown as { shift_id: string; pr_id: string } | undefined;
    if (!key) return false;
    return await recomputeShiftSale({ shiftId: key.shift_id, prId: key.pr_id }, actor);
  } catch (error) {
    logger.error('[shiftSaleFromReceipts.recomputeShiftSaleForAssignment] Error:', error);
    return false;
  }
}

/**
 * The recompute itself, keyed the same way shift_sale is.
 *
 * Only 'approved' and 'verified' receipts count. A manual self-log starts
 * 'pending' and must not move the outlet's revenue before a human has agreed to
 * it; the approve/verify transition calls back here.
 *
 * Writes a ZERO row rather than skipping when every receipt has been deleted or
 * un-approved — otherwise the last non-zero total would linger as the outlet's
 * revenue for a night that no longer has any.
 *
 * The `limit 1` on the outer select is safe because `shift_assignment` carries
 * `UNIQUE (shift_id, pr_id)` (0025, verified live) — one assignment per pair, so
 * there is nothing to choose between. That constraint is what makes reading
 * `sa.agency_id` deterministic; if it were ever dropped, this query would pick a
 * supplier agency at random and the commission would follow it.
 */
export async function recomputeShiftSale(key: ShiftPrKey, actor: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      with lines as (
        select ${BUCKET_SQL} as bucket,
               ${GROSS_SQL} as gross,
               coalesce(l.quantity, 0) as units,
               (nullif(split_part(l.ref, '|', 5), '') is null
                 and split_part(l.ref, '|', 1) = 'tips') as legacy_tip
        from main.payment_voucher_line l
        join main.payment_voucher_receipt r on r.id = l.receipt_id
        join main.shift_assignment sa on sa.id = r.shift_assignment_id
        where sa.shift_id = ${key.shiftId}
          and sa.pr_id = ${key.prId}
          and r.status in ('approved', 'verified')
      )
      select s.id as shift_id,
             sa.pr_id,
             (select u.id from main."user" u
               where u.id = coalesce(sa.user_id, sa.pr_id) limit 1) as user_id,
             s.outlet_id,
             -- The agency that SUPPLIED this PR, never s.agency_id. The shift's
             -- column is only the ANCHOR — the first agency the outlet addressed
             -- (0124) — so on a shift shared between agencies it names whoever was
             -- asked first, not whoever sent the person these sales belong to.
             -- Commission is computed off this column, and the manual create path
             -- already stamps the caller: leaving the anchor here would let the two
             -- writers of one row disagree, and since the upsert is keyed on
             -- (shift_id, pr_id) whichever inserted FIRST would stand forever.
             -- Live: JK House 2026-08-18 is anchored to Atlas while Alice is
             -- supplied by Why We Met, so the anchor would bill Atlas for her floor.
             -- (No backticks in here: this comment sits inside a JS template
             -- literal, and one would end the query mid-select.)
             sa.agency_id,
             s.shift_date,
             coalesce((select sum(units) from lines where bucket = 'drink'), 0)::int as drink_units,
             coalesce((select sum(gross) from lines where bucket = 'drink'), 0)::numeric(12,2)::text as drink_rm,
             coalesce((select sum(units) from lines where bucket = 'tip'), 0)::int as tip_units,
             coalesce((select sum(gross) from lines where bucket = 'tip'), 0)::numeric(12,2)::text as tip_rm,
             coalesce((select sum(units) from lines where bucket = 'service'), 0)::int as service_units,
             coalesce((select sum(gross) from lines where bucket = 'service'), 0)::numeric(12,2)::text as service_rm,
             coalesce((select sum(gross) from lines
                        where bucket in ('drink', 'tip', 'service')), 0)::numeric(12,2)::text as total_rm,
             coalesce((select count(*) from lines where legacy_tip), 0)::int as legacy_tip_lines
      from main.shift_assignment sa
      join main.shift s on s.id = sa.shift_id
      where sa.shift_id = ${key.shiftId} and sa.pr_id = ${key.prId}
      limit 1
    `);

    const row = result.rows[0] as unknown as RecomputeRow | undefined;
    if (!row) return false;

    if (row.legacy_tip_lines > 0) {
      logger.warn(
        `[shiftSaleFromReceipts] shift ${key.shiftId} PR ${key.prId}: ${row.legacy_tip_lines} line(s) carry no category and were booked to TIPS on their kind alone — they may be service entitlements.`,
      );
    }

    const saved = await shiftSaleRepository.upsert({
      shiftId: row.shift_id,
      prId: row.pr_id,
      userId: row.user_id,
      outletId: row.outlet_id,
      agencyId: row.agency_id,
      // The SHIFT's date, never the receipt's printed date: cost is grouped by
      // shift_date, so any other choice puts a night's revenue and its wages on
      // different bars. Live receipts print dates months off their shift.
      soldOn: row.shift_date,
      drinkUnits: row.drink_units,
      drinkSalesRm: row.drink_rm,
      tipUnits: row.tip_units,
      tipSalesRm: row.tip_rm,
      serviceUnits: row.service_units,
      serviceSalesRm: row.service_rm,
      // Stored, not derived — the Reports headline reads this while the Floor
      // Sales card sums the three buckets. They must agree.
      totalSalesRm: row.total_rm,
      createdBy: actor,
      updatedBy: actor,
    });
    return saved !== null;
  } catch (error) {
    logger.error('[shiftSaleFromReceipts.recomputeShiftSale] Error:', error);
    return false;
  }
}

/**
 * Recompute for the (shift, PR) behind a RECEIPT. No-op when the receipt has no
 * shift assignment — nothing can be attributed to a night we cannot name.
 */
export async function recomputeShiftSaleForReceipt(
  receiptId: string,
  actor: string,
): Promise<boolean> {
  try {
    const found = await db.execute(sql`
      select sa.shift_id, sa.pr_id
      from main.payment_voucher_receipt r
      join main.shift_assignment sa on sa.id = r.shift_assignment_id
      where r.id = ${receiptId}
      limit 1
    `);
    const key = found.rows[0] as unknown as { shift_id: string; pr_id: string } | undefined;
    if (!key) return false;
    return await recomputeShiftSale({ shiftId: key.shift_id, prId: key.pr_id }, actor);
  } catch (error) {
    logger.error('[shiftSaleFromReceipts.recomputeShiftSaleForReceipt] Error:', error);
    return false;
  }
}

/**
 * The (shift, PR) a line belongs to, WITHOUT recomputing.
 *
 * For deletes: resolve the key first, delete, then recompute with the key you
 * kept. Resolving afterwards finds nothing — and removing a receipt's last line
 * removes the receipt too, so even the receipt-scoped lookup goes blank. Either
 * way the deleted money would stand as the outlet's revenue forever.
 */
export async function resolveShiftPrForLine(lineId: string): Promise<ShiftPrKey | null> {
  try {
    const found = await db.execute(sql`
      select sa.shift_id, sa.pr_id
      from main.payment_voucher_line l
      join main.payment_voucher_receipt r on r.id = l.receipt_id
      join main.shift_assignment sa on sa.id = r.shift_assignment_id
      where l.id = ${lineId}
      limit 1
    `);
    const key = found.rows[0] as unknown as { shift_id: string; pr_id: string } | undefined;
    return key ? { shiftId: key.shift_id, prId: key.pr_id } : null;
  } catch (error) {
    logger.error('[shiftSaleFromReceipts.resolveShiftPrForLine] Error:', error);
    return null;
  }
}

/**
 * Recompute for the (shift, PR) behind a LINE. No-op for a line with no receipt
 * (a wages/overtime seal), which carries no floor sales by definition.
 *
 * ⚠️ On a DELETE, call this BEFORE the row goes — afterwards the line no longer
 * resolves to a receipt and the recompute silently does nothing, leaving the
 * deleted line's money standing as the outlet's revenue.
 */
export async function recomputeShiftSaleForLine(lineId: string, actor: string): Promise<boolean> {
  try {
    const found = await db.execute(sql`
      select sa.shift_id, sa.pr_id
      from main.payment_voucher_line l
      join main.payment_voucher_receipt r on r.id = l.receipt_id
      join main.shift_assignment sa on sa.id = r.shift_assignment_id
      where l.id = ${lineId}
      limit 1
    `);
    const key = found.rows[0] as unknown as { shift_id: string; pr_id: string } | undefined;
    if (!key) return false;
    return await recomputeShiftSale({ shiftId: key.shift_id, prId: key.pr_id }, actor);
  } catch (error) {
    logger.error('[shiftSaleFromReceipts.recomputeShiftSaleForLine] Error:', error);
    return false;
  }
}

/** Every (shift, PR) pair with at least one receipt-backed line — the backfill's work list. */
export async function listReceiptBackedShiftPrs(): Promise<ShiftPrKey[]> {
  const result = await db.execute(sql`
    select distinct sa.shift_id, sa.pr_id
    from main.payment_voucher_line l
    join main.payment_voucher_receipt r on r.id = l.receipt_id
    join main.shift_assignment sa on sa.id = r.shift_assignment_id
  `);
  return (result.rows as unknown as { shift_id: string; pr_id: string }[]).map((r) => ({
    shiftId: r.shift_id,
    prId: r.pr_id,
  }));
}
