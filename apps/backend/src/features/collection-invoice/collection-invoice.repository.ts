import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  CollectionInvoice,
  CollectionInvoiceFilter,
  CollectionInvoiceStatus,
  CollectionInvoiceTable,
} from './collection-invoice.model.js';

export type WeeklyOutletTotal = {
  agencyId: string;
  outletId: string;
  outletName: string;
  /** Decimal string, e.g. "4280.00". */
  amount: string;
  assignmentIds: string[];
};

export class CollectionInvoiceRepositoryClass {
  async list(filter: CollectionInvoiceFilter = {}): Promise<CollectionInvoice[]> {
    try {
      const where = [
        filter.agencyId ? eq(CollectionInvoiceTable.agencyId, filter.agencyId) : undefined,
        filter.outletId ? eq(CollectionInvoiceTable.outletId, filter.outletId) : undefined,
        filter.status ? eq(CollectionInvoiceTable.status, filter.status) : undefined,
        filter.weekStart ? eq(CollectionInvoiceTable.weekStart, filter.weekStart) : undefined,
      ].filter(Boolean);

      return await db
        .select()
        .from(CollectionInvoiceTable)
        .where(where.length > 0 ? and(...where) : undefined)
        .orderBy(desc(CollectionInvoiceTable.weekStart));
    } catch (error) {
      logger.error('[CollectionInvoiceRepository.list] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<CollectionInvoice | null> {
    try {
      const [row] = await db
        .select()
        .from(CollectionInvoiceTable)
        .where(eq(CollectionInvoiceTable.id, id))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[CollectionInvoiceRepository.getById] Error:', error);
      throw error;
    }
  }

  /**
   * What each outlet owes each agency for a week, straight from the work.
   *
   * Derived from shift_assignment, NOT by summing payment_voucher: a voucher
   * snapshots ONE outlet name (the generator takes `prRows[0].outletName`), so a
   * PR who worked two venues in a week has their whole voucher attributed to
   * whichever came first. Billing off that would invoice the wrong outlet.
   * Assignments carry the real outlet through their shift.
   *
   * Only `completed` counts — the same rule the voucher generator uses, so the
   * two agree on what "work that happened" means.
   */
  async weeklyOutletTotals(weekStart: string, weekEnd: string): Promise<WeeklyOutletTotal[]> {
    try {
      const result = await db.execute(sql`
        select
          sa.agency_id as agency_id,
          s.outlet_id  as outlet_id,
          max(o.name)  as outlet_name,
          to_char(coalesce(sum(sa.pay_amount), 0), 'FM9999999999990.00') as amount,
          array_agg(sa.id::text) as assignment_ids
        from main.shift_assignment sa
        join main.shift s  on s.id = sa.shift_id
        join main.outlet o on o.id = s.outlet_id
        where sa.status = 'completed'
          and s.shift_date between ${weekStart} and ${weekEnd}
        group by sa.agency_id, s.outlet_id
      `);

      const rows = (Array.isArray(result)
        ? result
        : ((result as { rows?: unknown[] })?.rows ?? [])) as Array<{
        agency_id: string;
        outlet_id: string;
        outlet_name: string;
        amount: string;
        assignment_ids: string[];
      }>;

      return rows.map((r) => ({
        agencyId: r.agency_id,
        outletId: r.outlet_id,
        outletName: r.outlet_name,
        amount: r.amount,
        assignmentIds: r.assignment_ids ?? [],
      }));
    } catch (error) {
      logger.error('[CollectionInvoiceRepository.weeklyOutletTotals] Error:', error);
      throw error;
    }
  }

  /**
   * Drafts one invoice per outlet for a week. Returns the rows created.
   *
   * onConflictDoNothing against the unique (agency, outlet, week) index — that
   * is what makes the weekly job safe to re-run. A second pass creates nothing
   * rather than quietly billing an outlet twice, and it deliberately does NOT
   * update an existing row: once an agency has issued an invoice, a later job
   * run must not move the number underneath them.
   */
  async draftForWeek(
    totals: WeeklyOutletTotal[],
    weekStart: string,
    weekEnd: string,
    actor: string,
  ): Promise<CollectionInvoice[]> {
    if (totals.length === 0) return [];
    try {
      return await db
        .insert(CollectionInvoiceTable)
        .values(
          totals.map((t) => ({
            agencyId: t.agencyId,
            outletId: t.outletId,
            outletName: t.outletName,
            weekStart,
            weekEnd,
            amount: t.amount,
            status: 'draft' as CollectionInvoiceStatus,
            sourceAssignmentIds: t.assignmentIds,
            createdBy: actor,
            updatedBy: actor,
          })),
        )
        .onConflictDoNothing()
        .returning();
    } catch (error) {
      logger.error('[CollectionInvoiceRepository.draftForWeek] Error:', error);
      throw error;
    }
  }

  async update(id: string, data: Partial<CollectionInvoice>): Promise<CollectionInvoice | null> {
    try {
      const [row] = await db
        .update(CollectionInvoiceTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(CollectionInvoiceTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[CollectionInvoiceRepository.update] Error:', error);
      throw error;
    }
  }
}
