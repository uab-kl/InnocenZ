import { and, desc, eq, inArray, isNull, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { UserTable } from '@/features/user/user.model.js';
import { logger } from '@/util/logger.js';
import {
  PaymentVoucherComponent,
  PaymentVoucherDisputeComponent,
  PaymentVoucherDisputeTable,
  PaymentVoucherLineTable,
  PaymentVoucherReceiptTable,
  PaymentVoucherTable,
  PaymentVoucherType,
} from './payment-voucher.model.js';

export type PaymentVoucherDispute = typeof PaymentVoucherDisputeTable.$inferSelect;
export type PaymentVoucherDisputeInsert = typeof PaymentVoucherDisputeTable.$inferInsert;

/** Postgres unique_violation — the one-per-day-per-component constraint firing. */
const UNIQUE_VIOLATION = '23505';

/**
 * Finds the driver's SQLSTATE, wherever it ended up.
 *
 * drizzle-orm 0.45 wraps query failures in a DrizzleQueryError and hangs the
 * real pg error off `cause`, so reading `error.code` at the top level silently
 * misses every constraint violation. That is not theoretical: it turned a
 * duplicate dispute into a 500 instead of a 409, and only an end-to-end test
 * caught it. Walking the chain works whether the error is wrapped or not.
 */
function sqlStateOf(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export class DuplicateDisputeError extends Error {
  constructor() {
    super('A dispute for this day and component already exists');
    this.name = 'DuplicateDisputeError';
  }
}

/**
 * A dispute names a coarse bucket (`wages | drinks | tips | others`) but a
 * voucher LINE carries the finer `payment_voucher_component`. The two
 * vocabularies are deliberately different — the PR app speaks in receipt kinds,
 * the ledger distinguishes overtime and deductions — so the mapping is explicit
 * rather than assumed equal.
 *
 * `ot` and `deduction` fall under 'others': overtime is logged on the phone with
 * kind 'others', and a deduction is not something the other three buckets can
 * describe. NULL components are legacy rows that predate classification; they
 * count under 'others' too, since leaving them uncountable would make a dispute
 * on an old voucher silently value at zero.
 */
const LINE_COMPONENTS_FOR: Readonly<
  Record<PaymentVoucherDisputeComponent, PaymentVoucherComponent[]>
> = {
  wages: ['wages'],
  drinks: ['drink_commission'],
  tips: ['tip_commission'],
  others: ['other', 'ot', 'deduction'],
};

export class PaymentVoucherDisputeRepositoryClass {
  /**
   * What the voucher currently says for one day + component, summed from its
   * lines.
   *
   * This is the baseline of a money claim, so it is computed here and never
   * accepted from the caller. Returns a fixed-2 string to match the numeric
   * column rather than carrying float error into a ledger.
   */
  /**
   * Resolve the line ids a claim names into the snapshot stored on it.
   *
   * Every field but the id comes from the DATABASE. The request supplies only
   * `lineId`, so a claimant cannot write the description or the amount their own
   * claim is measured against — the same reason `disputedAmount` is computed
   * server-side rather than accepted.
   *
   * Scoped by voucher, date and the bucket's components, so an id belonging to
   * another day, another bucket or another PR's voucher resolves to nothing
   * instead of being recorded as though it were part of this claim.
   */
  async resolveDisputeItems(
    voucherId: string,
    disputeDate: string,
    component: PaymentVoucherDisputeComponent,
    lineIds: string[],
  ): Promise<{ lineId: string; description: string; quantity: number; amount: string }[]> {
    const ids = [...new Set(lineIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];
    try {
      const wanted = LINE_COMPONENTS_FOR[component];
      const rows = await db
        .select({
          id: PaymentVoucherLineTable.id,
          description: PaymentVoucherLineTable.description,
          quantity: PaymentVoucherLineTable.quantity,
          amount: PaymentVoucherLineTable.amount,
          component: PaymentVoucherLineTable.component,
        })
        .from(PaymentVoucherLineTable)
        .where(
          and(
            eq(PaymentVoucherLineTable.voucherId, voucherId),
            eq(PaymentVoucherLineTable.lineDate, disputeDate),
            inArray(PaymentVoucherLineTable.id, ids),
          ),
        );
      return rows
        .filter((r) => (r.component === null ? component === 'others' : wanted.includes(r.component)))
        .map((r) => ({
          lineId: r.id,
          description: r.description,
          quantity: r.quantity,
          amount: r.amount,
        }));
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.resolveDisputeItems] Error:', error);
      return [];
    }
  }

  async sumLinesFor(
    voucherId: string,
    disputeDate: string,
    component: PaymentVoucherDisputeComponent,
    /**
     * Receipt NUMBERS (`RCP-000012`) the PR pointed at, when they contested one
     * shift out of several on the day. Absent or empty = the whole cell.
     *
     * Narrowing matters because this figure is what the claim is measured
     * against. A PR who works two shifts on one night and disputes only the
     * second would otherwise have their claim recorded against the day's FULL
     * total — the agency opening a queue row arguing about RM 7.20 when the PR
     * said RM 3.60 — and accepting it would settle money nobody contested.
     *
     * Keyed on `receipt_no`, NOT on the packed `ref`, deliberately. The packed
     * ref carries the ORDER number, which is not unique: the same paper logged
     * twice on one night yields two receipts both reading `ORD0389:0`, and that
     * duplicate is exactly the case this selection exists to separate.
     */
    receiptNos?: string[],
    /** The receipt's uuid — the FK path, which supersedes the numbers above. */
    receiptId?: string | null,
  ): Promise<string> {
    try {
      const wanted = LINE_COMPONENTS_FOR[component];
      const picked = (receiptNos ?? []).filter((n) => n.trim().length > 0);
      const rows = await db
        .select({
          amount: PaymentVoucherLineTable.amount,
          component: PaymentVoucherLineTable.component,
          receiptNo: PaymentVoucherReceiptTable.receiptNo,
          receiptId: PaymentVoucherLineTable.receiptId,
        })
        .from(PaymentVoucherLineTable)
        .leftJoin(
          PaymentVoucherReceiptTable,
          eq(PaymentVoucherLineTable.receiptId, PaymentVoucherReceiptTable.id),
        )
        .where(
          and(
            eq(PaymentVoucherLineTable.voucherId, voucherId),
            eq(PaymentVoucherLineTable.lineDate, disputeDate),
          ),
        );

      const total = rows
        .filter((r) => (r.component === null ? component === 'others' : wanted.includes(r.component)))
        /*
         * The FK wins when given; the receipt NUMBERS are the pre-0088 path.
         *
         * A line with no receipt (a wage seal) can never match either kind of
         * selection, so it drops out rather than inflating a narrowed sum.
         */
        .filter((r) => {
          if (receiptId) return r.receiptId === receiptId;
          if (picked.length === 0) return true;
          return r.receiptNo !== null && picked.includes(r.receiptNo);
        })
        .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

      return total.toFixed(2);
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.sumLinesFor] Error:', error);
      return '0.00';
    }
  }

  /**
   * Inserts a dispute. Throws DuplicateDisputeError when the day+component is
   * already disputed — the DB's UNIQUE constraint is the arbiter, not a
   * read-then-write check, which two concurrent taps would slip straight past.
   */
  async create(input: PaymentVoucherDisputeInsert): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db.insert(PaymentVoucherDisputeTable).values(input).returning();
      return row ?? null;
    } catch (error) {
      if (sqlStateOf(error) === UNIQUE_VIOLATION) {
        throw new DuplicateDisputeError();
      }
      logger.error('[PaymentVoucherDisputeRepository.create] Error:', error);
      return null;
    }
  }

  async listForVoucher(voucherId: string): Promise<PaymentVoucherDispute[]> {
    try {
      return await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(eq(PaymentVoucherDisputeTable.voucherId, voucherId));
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.listForVoucher] Error:', error);
      return [];
    }
  }

  /**
   * Every dispute raised against a SET of vouchers, in one query.
   *
   * For the receipts feed, which spans every voucher an agency owns and has to
   * say which of its receipts a PR is contesting. Bounded by the voucher ids
   * handed in rather than by a `limit`, deliberately: a cap here would badge
   * some receipts and silently leave others unbadged, which reads as "nobody
   * disputed this" — the one thing the badge exists to disprove.
   *
   * Settled disputes come back too. Whether a claim is still open is the
   * reader's decision (`outcome === null`), and a feed that dropped decided ones
   * could never show that a receipt HAD been argued about.
   */
  async listForVouchers(voucherIds: string[]): Promise<PaymentVoucherDispute[]> {
    const ids = [...new Set(voucherIds.filter((id) => id))];
    if (ids.length === 0) return [];
    try {
      return await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(inArray(PaymentVoucherDisputeTable.voucherId, ids))
        .orderBy(desc(PaymentVoucherDisputeTable.raisedAt));
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.listForVouchers] Error:', error);
      return [];
    }
  }

  /** Open = still awaiting agency review, i.e. no outcome recorded yet. */
  async listOpenForVoucher(voucherId: string): Promise<PaymentVoucherDispute[]> {
    try {
      return await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(
          and(
            eq(PaymentVoucherDisputeTable.voucherId, voucherId),
            isNull(PaymentVoucherDisputeTable.outcome),
          ),
        );
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.listOpenForVoucher] Error:', error);
      return [];
    }
  }

  /**
   * The still-open dispute on one day + component, if any. This is how the PR
   * app addresses a withdraw — it points at the grid cell it tapped, not at an
   * id it would otherwise have to track.
   */
  async findOpen(
    voucherId: string,
    disputeDate: string,
    component: PaymentVoucherDisputeComponent,
    /**
     * WHICH claim, when a day+bucket holds more than one.
     *
     * Since 0086 a PR can have one open claim PER SHIFT, so "the open drinks
     * claim on Tuesday" stopped being a single row. Without this the withdraw
     * took whichever came back first — cancelling an argument the PR had not
     * asked to drop. `null` explicitly targets the whole-day claim (the legacy
     * shape), which is why it is distinguished from `undefined`.
     */
    receiptId?: string | null,
  ): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(
          and(
            eq(PaymentVoucherDisputeTable.voucherId, voucherId),
            eq(PaymentVoucherDisputeTable.disputeDate, disputeDate),
            eq(PaymentVoucherDisputeTable.component, component),
            isNull(PaymentVoucherDisputeTable.outcome),
            ...(receiptId === undefined
              ? []
              : receiptId === null
                ? [isNull(PaymentVoucherDisputeTable.receiptId)]
                : [eq(PaymentVoucherDisputeTable.receiptId, receiptId)]),
          ),
        );
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.findOpen] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(eq(PaymentVoucherDisputeTable.id, id));
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.getById] Error:', error);
      return null;
    }
  }

  /**
   * Withdraws one open dispute.
   *
   * `isNull(outcome)` is part of the WHERE so a dispute the agency has already
   * decided cannot be retracted afterwards — that would rewrite the outcome of a
   * money decision. Returns null when nothing matched.
   */
  async withdraw(id: string, actor: string): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db
        .update(PaymentVoucherDisputeTable)
        .set({
          outcome: 'withdrawn',
          resolvedAt: new Date(),
          resolvedBy: actor,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(eq(PaymentVoucherDisputeTable.id, id), isNull(PaymentVoucherDisputeTable.outcome)),
        )
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.withdraw] Error:', error);
      return null;
    }
  }

  /**
   * The agency's review queue: every dispute on a voucher belonging to this
   * agency, newest first, with the voucher it hangs off.
   *
   * Scoping goes through the JOIN rather than a filter applied afterwards — a
   * dispute has no agency of its own, and reading them all and discarding the
   * wrong ones is how cross-tenant leaks happen. `agencyId: null` means admin,
   * which is unscoped by design.
   */
  /**
   * WHICH SHIFT each dispute is about — as assignment ids, never one id.
   *
   * The only column that narrows a dispute to a shift is `dispute.receipt_id`
   * (migration 0088), and it is NULLABLE BY DESIGN: the phone sends it only
   * when the contested cell has a receipt, and every pre-0088 row is null. A
   * null does NOT mean "unknown" — it means the claim covers the whole day and
   * bucket, i.e. EVERY shift the PR worked that day. That is why this returns
   * an array per dispute: a single id would force a silent pick, and on a
   * two-shift night the shifts are usually at DIFFERENT outlets, so the card
   * would show the wrong venue AND the wrong check-in while looking
   * authoritative.
   *
   * Do NOT resolve a shift by matching `shift.shift_date = dispute.dispute_date`.
   * `dispute_date` pairs with `line_date` — the day the receipt was LOGGED, not
   * the shift's own date — so that match breaks on midnight-crossing shifts and
   * on re-dated receipts. Go through the receipt FK or not at all.
   *
   * Three fixed queries regardless of queue size (the queue reads up to 200
   * rows), not one per dispute. Callers must STILL scope the returned ids to
   * the owning PR — see `listByIdsForPrs`.
   */
  async resolveAssignmentIdsForDisputes(
    rows: Array<{ dispute: PaymentVoucherDispute }>,
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (rows.length === 0) return out;
    try {
      // (A) Disputes that DO name a receipt — the exact, unambiguous path.
      const directReceiptIds = [
        ...new Set(rows.map((r) => r.dispute.receiptId).filter((id): id is string => !!id)),
      ];
      const assignmentByReceipt = new Map<string, string | null>();
      if (directReceiptIds.length > 0) {
        const receipts = await db
          .select({
            id: PaymentVoucherReceiptTable.id,
            shiftAssignmentId: PaymentVoucherReceiptTable.shiftAssignmentId,
          })
          .from(PaymentVoucherReceiptTable)
          .where(inArray(PaymentVoucherReceiptTable.id, directReceiptIds));
        for (const r of receipts) assignmentByReceipt.set(r.id, r.shiftAssignmentId ?? null);
      }

      // (B) Disputes with NO receipt — the claim spans the whole day+bucket, so
      // collect every receipt reachable from that day's lines in that bucket.
      const wholeDay = rows.filter((r) => !r.dispute.receiptId).map((r) => r.dispute);
      const dayLines: Array<{
        voucherId: string;
        /** Nullable: an UNDATED line belongs to no day, so the equality test
         *  below excludes it from every day-scoped claim, which is correct. */
        lineDate: string | null;
        component: PaymentVoucherComponent | null;
        shiftAssignmentId: string | null;
      }> = [];
      if (wholeDay.length > 0) {
        const lines = await db
          .select({
            voucherId: PaymentVoucherLineTable.voucherId,
            lineDate: PaymentVoucherLineTable.lineDate,
            component: PaymentVoucherLineTable.component,
            shiftAssignmentId: PaymentVoucherReceiptTable.shiftAssignmentId,
          })
          .from(PaymentVoucherLineTable)
          .leftJoin(
            PaymentVoucherReceiptTable,
            eq(PaymentVoucherLineTable.receiptId, PaymentVoucherReceiptTable.id),
          )
          .where(
            and(
              inArray(PaymentVoucherLineTable.voucherId, [
                ...new Set(wholeDay.map((d) => d.voucherId)),
              ]),
              inArray(PaymentVoucherLineTable.lineDate, [
                ...new Set(wholeDay.map((d) => d.disputeDate)),
              ]),
            ),
          );
        dayLines.push(...lines);
      }

      for (const { dispute } of rows) {
        if (dispute.receiptId) {
          const assignmentId = assignmentByReceipt.get(dispute.receiptId) ?? null;
          out.set(dispute.id, assignmentId ? [assignmentId] : []);
          continue;
        }
        // Same bucket rule as the value reader above — including the legacy
        // NULL-component fallback, so a dispute on an old voucher still
        // resolves instead of silently reading as "not linked".
        const wanted = LINE_COMPONENTS_FOR[dispute.component];
        const ids = dayLines
          .filter(
            (l) =>
              l.voucherId === dispute.voucherId &&
              l.lineDate === dispute.disputeDate &&
              (l.component === null
                ? dispute.component === 'others'
                : wanted.includes(l.component)) &&
              !!l.shiftAssignmentId,
          )
          .map((l) => l.shiftAssignmentId as string);
        out.set(dispute.id, [...new Set(ids)]);
      }
      return out;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.resolveAssignmentIdsForDisputes]', error);
      // Fail CLOSED: no shift block beats the wrong shift block.
      return new Map();
    }
  }

  async listForScope(
    agencyId: string | null,
    options?: { openOnly?: boolean; limit?: number },
  ): Promise<
    Array<{
      dispute: PaymentVoucherDispute;
      voucher: PaymentVoucherType & { prNickname: string | null };
    }>
  > {
    try {
      const conditions: SQL[] = [];
      if (agencyId) conditions.push(eq(PaymentVoucherTable.agencyId, agencyId));
      if (options?.openOnly) conditions.push(isNull(PaymentVoucherDisputeTable.outcome));

      // Nickname rides off the PR account (`user.username`). Post-cutover
      // `payment_voucher.pr_id` equals `user_id` — there is no `pr` table.
      // LEFT join: a voucher with no pr_id must still return its dispute.
      const rows = await db
        .select({
          dispute: PaymentVoucherDisputeTable,
          voucher: PaymentVoucherTable,
          prNickname: UserTable.username,
        })
        .from(PaymentVoucherDisputeTable)
        .innerJoin(
          PaymentVoucherTable,
          eq(PaymentVoucherDisputeTable.voucherId, PaymentVoucherTable.id),
        )
        .leftJoin(UserTable, eq(PaymentVoucherTable.prId, UserTable.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(PaymentVoucherDisputeTable.raisedAt))
        .limit(options?.limit ?? 200);

      return rows.map((row) => ({
        dispute: row.dispute,
        voucher: { ...row.voucher, prNickname: row.prNickname ?? null },
      }));
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.listForScope] Error:', error);
      return [];
    }
  }

  /**
   * Records the agency's decision.
   *
   * `isNull(outcome)` in the WHERE makes this a one-time transition: a dispute
   * already accepted, rejected or withdrawn cannot be re-decided, so the record
   * of what the agency concluded — and when — cannot be quietly rewritten later.
   *
   * Note this deliberately does NOT touch the voucher's lines. Accepting a claim
   * records that it was accepted; changing the money is a separate, explicit
   * edit. Rewriting lines here would delete and re-insert every line on the
   * voucher, including the PR's own self-logged ones.
   */
  async resolve(
    id: string,
    outcome: 'accepted' | 'rejected',
    resolutionNote: string | null,
    actor: string,
  ): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db
        .update(PaymentVoucherDisputeTable)
        .set({
          outcome,
          resolutionNote,
          resolvedAt: new Date(),
          resolvedBy: actor,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(eq(PaymentVoucherDisputeTable.id, id), isNull(PaymentVoucherDisputeTable.outcome)),
        )
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.resolve] Error:', error);
      return null;
    }
  }

  /** Confirms the disputed day is one the voucher actually covers. */
  async voucherHasDate(voucherId: string, disputeDate: string): Promise<boolean> {
    try {
      const rows = await db
        .select({ id: PaymentVoucherLineTable.id })
        .from(PaymentVoucherLineTable)
        .where(
          and(
            eq(PaymentVoucherLineTable.voucherId, voucherId),
            eq(PaymentVoucherLineTable.lineDate, disputeDate),
          ),
        )
        .limit(1);
      return rows.length > 0;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.voucherHasDate] Error:', error);
      return false;
    }
  }
}
