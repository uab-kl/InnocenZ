import { and, desc, eq, ilike, inArray, isNotNull, ne, not, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { buildMultiDayWhere } from '@/util/filter-date-format.js';
import {
  AdminRequest,
  AdminRequestFilter,
  AdminRequestInsertType,
  AdminRequestTable,
  AdminRequestType,
} from './admin-request.model.js';

export type NegotiatedByRoleRow = {
  subscriberType: 'outlet' | 'agency' | null;
  count: number;
  total: string;
  average: string;
};

export class AdminRequestRepositoryClass {
  /**
   * "Lands on a negotiated arrangement" — the POS add-on or the Custom tier.
   * The two admin inboxes split on exactly this: Plan Request owns everything
   * that ASKS FOR or ENDS a negotiated price, Plan Change owns the switches
   * that put an org on an ordinary banded tier.
   *
   * Two halves, and each earns its place:
   *
   *  • BY TYPE. `pos_integration_quote` and `custom_renegotiation` are the
   *    negotiation itself — joining Custom, re-agreeing its price, and LEAVING
   *    it are all filed as the latter, so all three stay on Plan Request in
   *    either direction. The admin who set a price must see it end.
   *
   *  • BY DESTINATION. A venue moving Enterprise → Custom files a plain
   *    `plan_change`, so type alone would file it under the wrong page.
   *
   * ⚠️ DESTINATION, not either side (owner's call, 27 Aug 2026). This tested
   * `current_plan_id` too, which sent the RESET — the plain `plan_change` that
   * lands an org back on Starter after Custom ends — to Plan Request as well.
   * The result was that Plan Change could hold nothing recent for an org that
   * had ever touched Custom: Atlas had 14 requests, 13 of them routed away, and
   * the one left on Plan Change was a 17 Jul switch that never reached the
   * ledger, still presented as its current position six weeks later.
   *
   * The rule it replaces was written to keep the END of a negotiation visible,
   * and that still holds — the cancellation REQUEST is a `custom_renegotiation`
   * and is caught by type above, whatever tier it names. Only the resulting
   * switch onto a normal tier moves, which is where an admin looks for it.
   */
  private negotiatedClause(): SQL {
    return sql`(
      ${AdminRequestTable.type} in ('pos_integration_quote', 'custom_renegotiation')
      or (
        ${AdminRequestTable.type} = 'plan_change'
        and exists (
          select 1 from "main"."subscription" s
          where s.id = ${AdminRequestTable.requestedPlanId}
            and (s.name = 'Custom' or s.kind = 'addon')
        )
      )
    )`;
  }

  private buildConditions(filter?: AdminRequestFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.type) {
      const typeClause = Array.isArray(filter.type)
        ? inArray(AdminRequestTable.type, filter.type)
        : eq(AdminRequestTable.type, filter.type);
      // Leaving a negotiated arrangement belongs in the same inbox as entering
      // one: when an agency switches OFF Custom the agreed price stops applying,
      // and the admin who set that price needs to see it end. Such a row is a
      // plain plan_change, so without this it would only appear on the Plan
      // Change page and the negotiation would look open forever.
      conditions.push(typeClause);
    }

    if (filter?.negotiated) {
      const clause = this.negotiatedClause();
      conditions.push(filter.negotiated === 'only' ? clause : not(clause));
    }
    if (filter?.excludeType) conditions.push(ne(AdminRequestTable.type, filter.excludeType));
    if (filter?.status) conditions.push(eq(AdminRequestTable.status, filter.status));
    if (filter?.search) conditions.push(ilike(AdminRequestTable.subscriberName, `%${filter.search}%`));
    if (filter?.subscriberType) conditions.push(eq(AdminRequestTable.subscriberType, filter.subscriberType));
    const requestedOn = buildMultiDayWhere(AdminRequestTable.createdAt, filter?.dates);
    if (requestedOn) conditions.push(requestedOn);
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * One row per subscriber — the most recent request only.
   *
   * A venue that taps "Switch to…" three times files three requests, and the
   * admin queue then shows three competing answers for the same venue, where
   * approving an older one would apply a plan the venue has since moved off.
   * Superseded requests are NOT deleted: they stay in the table as the record of
   * what was asked, they are simply not offered for action.
   *
   * Rows with no `subscriber_id` (a request that named no organisation) each
   * count as their own subscriber, so none of them swallow the others.
   */
  private async listLatestPerSubscriber(params: {
    whereClause: SQL | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ records: AdminRequest[]; totalCount: number }> {
    const { whereClause, page, pageSize } = params;
    const key = sql`coalesce(${AdminRequestTable.subscriberId}::text, ${AdminRequestTable.id}::text)`;

    // An OUTSTANDING request wins over an answered one, then the newest.
    // Without the first clause the row picked is whatever sorts first among
    // equal timestamps: a venue that filed two switches in the same minute and
    // had one approved could show the approved row in the admin queue while its
    // own screen showed the other still awaiting — the two screens reading the
    // same subscriber by different rules.
    const outstandingFirst = sql`(${AdminRequestTable.status} = 'pending') desc`;

    const latest = db
      .selectDistinctOn([sql`coalesce(${AdminRequestTable.subscriberId}::text, ${AdminRequestTable.id}::text)`])
      .from(AdminRequestTable)
      .where(whereClause)
      .orderBy(key, outstandingFirst, desc(AdminRequestTable.createdAt))
      .as('latest');

    const [countRow] = await db.select({ value: sql<number>`count(*)::int` }).from(latest);
    const totalCount = Number(countRow?.value ?? 0);

    const records = (await db
      .select()
      .from(latest)
      .orderBy(desc(latest.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as AdminRequest[];

    return { records, totalCount };
  }

  async listPaginated(params: {
    filter?: AdminRequestFilter;
    page: number;
    pageSize: number;
  }): Promise<{ records: AdminRequest[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const whereClause = this.buildConditions(filter);

      if (filter?.latestPerSubscriber) {
        return await this.listLatestPerSubscriber({ whereClause, page, pageSize });
      }

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(AdminRequestTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const records = await db
        .select()
        .from(AdminRequestTable)
        .where(whereClause)
        .orderBy(desc(AdminRequestTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { records, totalCount };
    } catch (error) {
      logger.error('[AdminRequestRepository.listPaginated] Error:', error);
      return { records: [], totalCount: 0 };
    }
  }

  /** The newest request of this type still awaiting an admin, for these subscribers. */
  async latestPendingByType(
    subscriberIds: string[],
    type: AdminRequestType,
  ): Promise<AdminRequest | null> {
    try {
      if (subscriberIds.length === 0) return null;
      const [row] = await db
        .select()
        .from(AdminRequestTable)
        .where(
          and(
            eq(AdminRequestTable.type, type),
            eq(AdminRequestTable.status, 'pending'),
            inArray(AdminRequestTable.subscriberId, subscriberIds),
          ),
        )
        .orderBy(desc(AdminRequestTable.createdAt))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[AdminRequestRepository.latestPendingByType] Error:', error);
      return null;
    }
  }

  /**
   * Every subscriber with a request of this type still awaiting an answer.
   *
   * The set form of `latestPendingByType`, and DELIBERATELY the same status
   * test — `pending`, nothing else — because the agency's Subscription screen
   * reads that method to decide whether it is "waiting for admin", and this one
   * decides whether the weekly job may re-band. Two definitions of "still
   * waiting" is how the page and the job come to disagree about the same
   * agency, which is exactly the fault this exists to close.
   *
   * Returns `null` on a read failure rather than an empty set. An empty set
   * means "nobody is mid-negotiation", which would let the caller re-price
   * every agency including the ones it must not touch — a query that failed
   * must not read as a quiet week. Callers are expected to stop, not proceed.
   *
   * One query for all subscribers rather than one per row: the caller already
   * runs a PV count per agency, and adding a second per-agency round trip to a
   * weekly loop is a cost with nothing to show for it.
   */
  async subscriberIdsAwaitingAnswer(type: AdminRequestType): Promise<Set<string> | null> {
    try {
      const rows = await db
        .select({ subscriberId: AdminRequestTable.subscriberId })
        .from(AdminRequestTable)
        .where(
          and(
            eq(AdminRequestTable.type, type),
            eq(AdminRequestTable.status, 'pending'),
            isNotNull(AdminRequestTable.subscriberId),
          ),
        );
      return new Set(
        rows.map((row) => row.subscriberId).filter((id): id is string => Boolean(id)),
      );
    } catch (error) {
      logger.error('[AdminRequestRepository.subscriberIdsAwaitingAnswer] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<AdminRequest | null> {
    try {
      const [row] = await db.select().from(AdminRequestTable).where(eq(AdminRequestTable.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[AdminRequestRepository.getById] Error:', error);
      return null;
    }
  }

  async create(
    data: Omit<AdminRequestInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<AdminRequest | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient.insert(AdminRequestTable).values(data).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AdminRequestRepository.create] Error:', error);
      return null;
    }
  }

  async update(
    id: string,
    data: Partial<AdminRequestInsertType>,
    tx?: DbTransaction,
  ): Promise<AdminRequest | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient
        .update(AdminRequestTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(AdminRequestTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AdminRequestRepository.update] Error:', error);
      return null;
    }
  }

  async countPending(
    filter?: Pick<AdminRequestFilter, 'type' | 'excludeType'>,
  ): Promise<number> {
    try {
      const conditions: SQL[] = [eq(AdminRequestTable.status, 'pending')];
      if (filter?.type) {
        conditions.push(
          Array.isArray(filter.type)
            ? inArray(AdminRequestTable.type, filter.type)
            : eq(AdminRequestTable.type, filter.type),
        );
      }
      if (filter?.excludeType) conditions.push(ne(AdminRequestTable.type, filter.excludeType));
      const [row] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(AdminRequestTable)
        .where(and(...conditions));
      return Number(row?.value ?? 0);
    } catch (error) {
      logger.error('[AdminRequestRepository.countPending] Error:', error);
      return 0;
    }
  }

  // Successfully negotiated prices (resolved requests that carry a quoted amount),
  // aggregated by subscriber role (outlet vs agency).
  async negotiatedByRole(): Promise<NegotiatedByRoleRow[]> {
    try {
      const rows = await db
        .select({
          subscriberType: AdminRequestTable.subscriberType,
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${AdminRequestTable.quotedAmount}), 0)::text`,
          average: sql<string>`coalesce(round(avg(${AdminRequestTable.quotedAmount}), 2), 0)::text`,
        })
        .from(AdminRequestTable)
        .where(and(eq(AdminRequestTable.status, 'resolved'), isNotNull(AdminRequestTable.quotedAmount)))
        .groupBy(AdminRequestTable.subscriberType);
      return rows;
    } catch (error) {
      logger.error('[AdminRequestRepository.negotiatedByRole] Error:', error);
      return [];
    }
  }
}
