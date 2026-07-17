import { and, eq, gte, ilike, lte, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import {
  PaymentVoucherTable,
  PaymentVoucherLineTable,
  PaymentVoucherInsertType,
  PaymentVoucherLineInsertType,
  PaymentVoucherType,
  PaymentVoucherWithLines,
  PaymentVoucherFilter,
} from './payment-voucher.model';

type LineInput = Omit<PaymentVoucherLineInsertType, 'id' | 'voucherId'>;

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
}
