import { and, eq, getTableColumns, ilike, inArray, or, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { ActorUser, actorJoinOn, actorNameColumn } from '@/util/actor-name';
// Leaf model — safe to import here. `agency-outlet.model` imports `outlet.model`
// (not this repository), so nothing loops back.
import { AgencyOutletTable } from '@/features/agency/agency-outlet.model';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { OutletTable, OutletInsertType, OutletType, OutletFilter } from './outlet.model';


/**
 * The row plus WHO LAST TOUCHED IT, by name.
 *
 * A separate exported type rather than widening the model: `updated_by_name`
 * is NOT a column and must never become one. It is resolved through a join on
 * every read, so a person who is later renamed reads correctly on every record
 * they ever touched — one fact, one table. See `util/actor-name.ts`.
 */
export type OutletWithActor = OutletType & { updatedByName: string | null };

export class OutletRepositoryClass {
  async create(
    data: Omit<OutletInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<OutletType> {
    try {
      const dbClient = tx ?? db;
      const [outlet] = await dbClient.insert(OutletTable).values(data).returning();
      logger.info('[OutletRepository.create] Outlet created:', outlet.id);
      return outlet;
    } catch (error) {
      logger.error('[OutletRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<OutletInsertType>,
    tx?: DbTransaction,
  ): Promise<OutletType | null> {
    try {
      const dbClient = tx ?? db;
      const [outlet] = await dbClient
        .update(OutletTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(OutletTable.id, id))
        .returning();
      return outlet ?? null;
    } catch (error) {
      logger.error('[OutletRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<OutletType | null> {
    try {
      const [outlet] = await db
        .select()
        .from(OutletTable)
        .where(eq(OutletTable.id, id))
        .limit(1);
      return outlet ?? null;
    } catch (error) {
      logger.error('[OutletRepository.getById] Error:', error);
      return null;
    }
  }

  async listPaginated(params: {
    filter?: OutletFilter;
    page: number;
    pageSize: number;
  }): Promise<{ outlets: OutletWithActor[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(OutletTable.id, filter.id));
      if (filter?.status) conditions.push(eq(OutletTable.status, filter.status));
      if (filter?.name) conditions.push(ilike(OutletTable.name, `%${filter.name}%`));
      // THE AGENCY PORTAL'S VISIBILITY RULE (0123, widened by 0127). A subquery
      // rather than a join, so a venue linked to several agencies still yields
      // exactly ONE outlet row — a join here would duplicate it once per link
      // and silently inflate `totalCount`, which is the paginator's own input.
      //
      // `approved`, PLUS an `ended` partnership that still has work in flight.
      // That second arm is not a loophole, it is the other half of ending a
      // link: `shift_agency` has no FK to `agency_outlet`, so shifts already
      // posted survive the ending untouched — but on the approved-only rule the
      // venue vanished from this list the same instant, leaving the agency with
      // PRs rostered at a venue it could no longer open. The obligation
      // outlived the access. Access now lapses on its own once the last
      // rostered date passes, which is exactly when the obligation does.
      //
      // ⚠️ This set is therefore NO LONGER "the venues this agency may staff".
      // Anything asking THAT question — anywhere a new commitment is made —
      // must read `listApprovedOutletIdsForAgency`, which stayed narrow on
      // purpose. Everything reading this one is showing or servicing work that
      // already exists.
      if (filter?.linkedToAgencyId) {
        const agencyId = filter.linkedToAgencyId;
        conditions.push(
          inArray(
            OutletTable.id,
            db
              .select({ outletId: AgencyOutletTable.outletId })
              .from(AgencyOutletTable)
              .where(
                and(
                  eq(AgencyOutletTable.agencyId, agencyId),
                  or(
                    eq(AgencyOutletTable.approveStatus, 'approved'),
                    and(
                      eq(AgencyOutletTable.approveStatus, 'ended'),
                      // Raw SQL rather than importing the shift models: this
                      // repository has no other reason to depend on them, and a
                      // latent import cycle has taken the agency portal down
                      // once already.
                      //
                      // `>= CURRENT_DATE` — today's shift is still live, and an
                      // agency that loses the venue at midnight on the day its
                      // last PRs are working could not check them in.
                      sql`EXISTS (
                        SELECT 1
                        FROM "main"."shift_agency" sa
                        JOIN "main"."shift" s ON s."id" = sa."shift_id"
                        WHERE sa."agency_id" = ${agencyId}
                          AND s."outlet_id" = ${AgencyOutletTable.outletId}
                          AND s."shift_date" >= CURRENT_DATE
                      )`,
                    ),
                  )!,
                ),
              ),
          ),
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(OutletTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const outlets = await db
        .select({ ...getTableColumns(OutletTable), updatedByName: actorNameColumn })
        .from(OutletTable)
        // WHO SWITCHED IT OFF, by name. LEFT and cast uuid->text, so a row
        // stamped `'system'` still appears — see `util/actor-name.ts`.
        .leftJoin(ActorUser, actorJoinOn(OutletTable.updatedBy))
        .where(whereClause)
        .orderBy(OutletTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { outlets, totalCount };
    } catch (error) {
      logger.error('[OutletRepository.listPaginated] Error:', error);
      return { outlets: [], totalCount: 0 };
    }
  }
}
