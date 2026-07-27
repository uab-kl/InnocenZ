import { and, desc, eq, gte, ilike, inArray, lte, ne, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import {
  PaymentVoucherTable,
  PaymentVoucherLineTable,
  PaymentVoucherReceiptTable,
  PaymentVoucherInsertType,
  PaymentVoucherLineInsertType,
  PaymentVoucherReceiptInsertType,
  PaymentVoucherReceiptType,
  PaymentVoucherType,
  PaymentVoucherLineType,
  PaymentVoucherWithLines,
  PaymentVoucherFilter,
  PaymentVoucherStatus,
} from './payment-voucher.model';

type LineInput = Omit<PaymentVoucherLineInsertType, 'id' | 'voucherId'>;
type ReceiptInput = Omit<
  PaymentVoucherReceiptInsertType,
  'id' | 'receiptNo' | 'createdAt' | 'updatedAt'
>;

export class PaymentVoucherRepositoryClass {
  async create(
    data: Omit<PaymentVoucherInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    lines: LineInput[],
  ): Promise<PaymentVoucherWithLines> {
    try {
      const created = await db.transaction(async (tx) => {
        const [voucher] = await tx.insert(PaymentVoucherTable).values(data).returning();
        const insertedLines =
          lines.length > 0
            ? await tx
                .insert(PaymentVoucherLineTable)
                .values(lines.map((line, i) => ({ ...line, voucherId: voucher.id, sortOrder: i })))
                .returning()
            : [];
        return { ...voucher, lines: insertedLines };
      });
      logger.info('[PaymentVoucherRepository.create] Voucher created:', created.id);
      return created;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.create] Error:', error);
      throw error;
    }
  }

  /** Updates the header; when `lines` is provided the line set is replaced wholesale. */
  async update(
    id: string,
    data: Partial<PaymentVoucherInsertType>,
    lines?: LineInput[],
  ): Promise<PaymentVoucherWithLines | null> {
    try {
      return await db.transaction(async (tx) => {
        const [voucher] = await tx
          .update(PaymentVoucherTable)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(PaymentVoucherTable.id, id))
          .returning();
        // Empty result => row not found (a genuine null); a real DB error re-throws below.
        if (!voucher) return null;

        if (lines) {
          await tx.delete(PaymentVoucherLineTable).where(eq(PaymentVoucherLineTable.voucherId, id));
          const insertedLines =
            lines.length > 0
              ? await tx
                  .insert(PaymentVoucherLineTable)
                  .values(lines.map((line, i) => ({ ...line, voucherId: id, sortOrder: i })))
                  .returning()
              : [];
          return { ...voucher, lines: insertedLines };
        }

        const existingLines = await this.getLines(id, tx);
        return { ...voucher, lines: existingLines };
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.update] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<PaymentVoucherWithLines | null> {
    try {
      const [voucher] = await db
        .select()
        .from(PaymentVoucherTable)
        .where(eq(PaymentVoucherTable.id, id))
        .limit(1);
      if (!voucher) return null;
      const lines = await this.getLines(id);
      return { ...voucher, lines };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getById] Error:', error);
      throw error;
    }
  }

  private async getLines(voucherId: string, tx?: DbTransaction) {
    const dbClient = tx ?? db;
    return dbClient
      .select()
      .from(PaymentVoucherLineTable)
      .where(eq(PaymentVoucherLineTable.voucherId, voucherId))
      .orderBy(PaymentVoucherLineTable.sortOrder);
  }

  async listPaginated(params: {
    filter?: PaymentVoucherFilter;
    page: number;
    pageSize: number;
  }): Promise<{ vouchers: PaymentVoucherType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(PaymentVoucherTable.id, filter.id));
      if (filter?.agencyId) conditions.push(eq(PaymentVoucherTable.agencyId, filter.agencyId));
      if (filter?.prId) conditions.push(eq(PaymentVoucherTable.prId, filter.prId));
      if (filter?.status) conditions.push(eq(PaymentVoucherTable.status, filter.status));
      if (filter?.prName) conditions.push(ilike(PaymentVoucherTable.prName, `%${filter.prName}%`));
      if (filter?.fromDate) conditions.push(gte(PaymentVoucherTable.issuedDate, filter.fromDate));
      if (filter?.toDate) conditions.push(lte(PaymentVoucherTable.issuedDate, filter.toDate));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(PaymentVoucherTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const vouchers = await db
        .select()
        .from(PaymentVoucherTable)
        .where(whereClause)
        .orderBy(PaymentVoucherTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { vouchers, totalCount };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  /**
   * Whether a voucher already exists for this PR + week (idempotency guard for
   * the weekly generation job, so re-running never double-pays).
   */
  async existsForPrWeek(agencyId: string, prId: string, weekStart: string): Promise<boolean> {
    try {
      const [row] = await db
        .select({ id: PaymentVoucherTable.id })
        .from(PaymentVoucherTable)
        .where(
          and(
            eq(PaymentVoucherTable.agencyId, agencyId),
            eq(PaymentVoucherTable.prId, prId),
            eq(PaymentVoucherTable.weekStart, weekStart),
          ),
        )
        .limit(1);
      return !!row;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.existsForPrWeek] Error:', error);
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const [row] = await db
        .delete(PaymentVoucherTable)
        .where(eq(PaymentVoucherTable.id, id))
        .returning({ id: PaymentVoucherTable.id });
      // No row => not found; a real DB error re-throws below. Lines cascade.
      return !!row;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.remove] Error:', error);
      throw error;
    }
  }

  // --- PR current-week draft voucher + line-level ops -----------------------
  // A PR accumulates a week's earnings on ONE pending_review voucher (the draft
  // the weekly generator would otherwise create — existsForPrWeek makes the two
  // idempotent). Each self-log / wages seal is a single line on it.

  /** The PR's current-week draft voucher (pending_review) with its lines, or null. */
  async getCurrentWeekDraft(prId: string, weekStart: string): Promise<PaymentVoucherWithLines | null> {
    try {
      const [voucher] = await db
        .select()
        .from(PaymentVoucherTable)
        .where(
          and(
            eq(PaymentVoucherTable.prId, prId),
            eq(PaymentVoucherTable.weekStart, weekStart),
            eq(PaymentVoucherTable.status, 'pending_review'),
          ),
        )
        .limit(1);
      if (!voucher) return null;
      const lines = await this.getLines(voucher.id);
      return { ...voucher, lines };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getCurrentWeekDraft] Error:', error);
      throw error;
    }
  }

  /**
   * The PR's voucher for a given week regardless of status (draft, sent,
   * signed, paid…) with its lines — used for the Payment "Last week" view. The
   * most recently created one wins if more than one exists.
   */
  async getWeekVoucher(prId: string, weekStart: string): Promise<PaymentVoucherWithLines | null> {
    try {
      const [voucher] = await db
        .select()
        .from(PaymentVoucherTable)
        .where(
          and(
            eq(PaymentVoucherTable.prId, prId),
            eq(PaymentVoucherTable.weekStart, weekStart),
          ),
        )
        .orderBy(desc(PaymentVoucherTable.createdAt))
        .limit(1);
      if (!voucher) return null;
      const lines = await this.getLines(voucher.id);
      return { ...voucher, lines };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getWeekVoucher] Error:', error);
      throw error;
    }
  }

  /**
   * Signed/paid vouchers for the PR History → Payment tab (and payroll weeks
   * on History → Shifts). Newest week first. Optional `statuses` defaults to
   * signed + paid; pass past-week statuses when Shifts needs sealed drafts too.
   */
  async listHistoryForPr(
    prId: string,
    opts?: { statuses?: PaymentVoucherStatus[]; excludeWeekStart?: string },
  ): Promise<PaymentVoucherWithLines[]> {
    try {
      const statuses = opts?.statuses ?? (['signed', 'paid'] as PaymentVoucherStatus[]);
      const conditions = [
        eq(PaymentVoucherTable.prId, prId),
        inArray(PaymentVoucherTable.status, statuses),
      ];
      if (opts?.excludeWeekStart) {
        conditions.push(ne(PaymentVoucherTable.weekStart, opts.excludeWeekStart));
      }
      const vouchers = await db
        .select()
        .from(PaymentVoucherTable)
        .where(and(...conditions))
        .orderBy(desc(PaymentVoucherTable.weekStart), desc(PaymentVoucherTable.createdAt));

      const withLines: PaymentVoucherWithLines[] = [];
      for (const voucher of vouchers) {
        const lines = await this.getLines(voucher.id);
        withLines.push({ ...voucher, lines });
      }
      return withLines;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.listHistoryForPr] Error:', error);
      throw error;
    }
  }

  /** Finds the PR's current-week draft voucher, creating an empty one if absent. */
  async getOrCreateCurrentWeekDraft(data: {
    prId: string;
    agencyId: string;
    prName: string;
    prIc?: string | null;
    outlet?: string | null;
    weekStart: string;
    weekEnd: string;
    actor: string;
  }): Promise<PaymentVoucherType> {
    try {
      const existing = await this.getCurrentWeekDraft(data.prId, data.weekStart);
      if (existing) return existing;
      const [voucher] = await db
        .insert(PaymentVoucherTable)
        .values({
          agencyId: data.agencyId,
          prId: data.prId,
          prName: data.prName,
          prIc: data.prIc ?? undefined,
          outlet: data.outlet ?? undefined,
          cycle: 'Weekly',
          weekStart: data.weekStart,
          weekEnd: data.weekEnd,
          subtotal: '0.00',
          deduction: '0.00',
          net: '0.00',
          status: 'pending_review',
          createdBy: data.actor,
          updatedBy: data.actor,
        })
        .returning();
      return voucher;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getOrCreateCurrentWeekDraft] Error:', error);
      throw error;
    }
  }

  /** One line joined to its voucher — used to authorize a PR line op by owner. */
  async getLineWithVoucher(
    lineId: string,
  ): Promise<{ line: PaymentVoucherLineType; voucher: PaymentVoucherType } | null> {
    try {
      const [row] = await db
        .select({ line: PaymentVoucherLineTable, voucher: PaymentVoucherTable })
        .from(PaymentVoucherLineTable)
        .innerJoin(PaymentVoucherTable, eq(PaymentVoucherLineTable.voucherId, PaymentVoucherTable.id))
        .where(eq(PaymentVoucherLineTable.id, lineId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getLineWithVoucher] Error:', error);
      throw error;
    }
  }

  /** A receipt already logged for this voucher with the same order number, if any. */
  async findReceiptByOrderNo(
    voucherId: string,
    orderNo: string,
  ): Promise<PaymentVoucherReceiptType | null> {
    try {
      const [row] = await db
        .select()
        .from(PaymentVoucherReceiptTable)
        .where(
          and(
            eq(PaymentVoucherReceiptTable.voucherId, voucherId),
            eq(PaymentVoucherReceiptTable.orderNo, orderNo),
          ),
        )
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.findReceiptByOrderNo] Error:', error);
      throw error;
    }
  }

  /**
   * Persists ONE whole receipt: the payment_voucher_receipt row (with its
   * DATABASE-GENERATED unique running number RCP-000001, RCP-000002, … based
   * on how many receipts exist) plus one payment_voucher_line per item,
   * FK-linked via receipt_id — all in a single transaction, then the voucher
   * totals recompute. Retries the running number on a rare unique collision.
   */
  async createReceiptWithLines(
    receipt: ReceiptInput,
    lines: LineInput[],
  ): Promise<{ receipt: PaymentVoucherReceiptType; lines: PaymentVoucherLineType[] }> {
    try {
      return await db.transaction(async (tx) => {
        const [{ total }] = await tx
          .select({ total: sql<number>`count(*)` })
          .from(PaymentVoucherReceiptTable);
        let inserted: PaymentVoucherReceiptType | null = null;
        for (let bump = 1; bump <= 5 && !inserted; bump++) {
          const receiptNo = `RCP-${String(Number(total) + bump).padStart(6, '0')}`;
          try {
            const [row] = await tx
              .insert(PaymentVoucherReceiptTable)
              .values({ ...receipt, receiptNo })
              .returning();
            inserted = row;
          } catch (e) {
            const pgCode = (e as { code?: string }).code;
            if (pgCode !== '23505' || bump === 5) throw e; // not a dupe, or out of retries
          }
        }
        if (!inserted) throw new Error('Could not allocate a receipt number');
        const existing = await this.getLines(receipt.voucherId, tx);
        const insertedLines = await tx
          .insert(PaymentVoucherLineTable)
          .values(
            lines.map((line, i) => ({
              ...line,
              voucherId: receipt.voucherId,
              receiptId: inserted!.id,
              sortOrder: existing.length + i,
            })),
          )
          .returning();
        await this.recomputeTotals(receipt.voucherId, tx);
        return { receipt: inserted, lines: insertedLines };
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.createReceiptWithLines] Error:', error);
      throw error;
    }
  }

  /** Appends one line to a voucher and recomputes its totals. */
  async addLine(voucherId: string, line: LineInput): Promise<PaymentVoucherLineType> {
    try {
      return await db.transaction(async (tx) => {
        const existing = await this.getLines(voucherId, tx);
        const [inserted] = await tx
          .insert(PaymentVoucherLineTable)
          .values({ ...line, voucherId, sortOrder: existing.length })
          .returning();
        await this.recomputeTotals(voucherId, tx);
        return inserted;
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.addLine] Error:', error);
      throw error;
    }
  }

  /** Patches one line in place and recomputes its voucher totals. */
  async updateLine(
    lineId: string,
    patch: Partial<LineInput>,
  ): Promise<PaymentVoucherLineType | null> {
    try {
      return await db.transaction(async (tx) => {
        const [line] = await tx
          .update(PaymentVoucherLineTable)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(PaymentVoucherLineTable.id, lineId))
          .returning();
        if (!line) return null;
        await this.recomputeTotals(line.voucherId, tx);
        return line;
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.updateLine] Error:', error);
      throw error;
    }
  }

  /** Removes one line and recomputes its voucher totals. */
  async deleteLine(lineId: string): Promise<boolean> {
    try {
      return await db.transaction(async (tx) => {
        const [line] = await tx
          .delete(PaymentVoucherLineTable)
          .where(eq(PaymentVoucherLineTable.id, lineId))
          .returning({ voucherId: PaymentVoucherLineTable.voucherId });
        if (!line) return false;
        await this.recomputeTotals(line.voucherId, tx);
        return true;
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.deleteLine] Error:', error);
      throw error;
    }
  }

  /** subtotal = Σ line amounts; net = subtotal − deduction. */
  private async recomputeTotals(voucherId: string, tx: DbTransaction): Promise<void> {
    const [row] = await tx
      .select({ subtotal: sql<string>`coalesce(sum(${PaymentVoucherLineTable.amount}), 0)::numeric(12,2)` })
      .from(PaymentVoucherLineTable)
      .where(eq(PaymentVoucherLineTable.voucherId, voucherId));
    const subtotal = Number(row?.subtotal ?? 0);
    const [voucher] = await tx
      .select({ deduction: PaymentVoucherTable.deduction })
      .from(PaymentVoucherTable)
      .where(eq(PaymentVoucherTable.id, voucherId));
    const deduction = Number(voucher?.deduction ?? 0);
    await tx
      .update(PaymentVoucherTable)
      .set({
        subtotal: subtotal.toFixed(2),
        net: (subtotal - deduction).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(PaymentVoucherTable.id, voucherId));
  }
}
