import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  OutletDrinkMenuInsertType,
  OutletDrinkMenuTable,
  OutletTierRateInsertType,
  OutletTierRateTable,
  OutletWorkspace,
  OutletWorkspaceAggregate,
  OutletWorkspaceInsertType,
  OutletWorkspaceTable,
} from './outlet-workspace.model.js';

// Child rows for an upsert, minus workspaceId/outletId (both set by the repo
// inside the transaction from the parent outlet).
export type WorkspaceChildren = {
  /**
   * ⚠️ `undefined` means the caller did not send this list, and it MUST be
   * left exactly as it is. Only an explicit array replaces — an empty one
   * clears, a populated one swaps.
   *
   * The distinction is the whole point: the upsert below DELETES before it
   * inserts, so treating "absent" as "empty" erased a venue's rate card and
   * answered 200. Two venues lost all seven tier rows that way.
   */
  tierRates?: Omit<OutletTierRateInsertType, 'id' | 'workspaceId' | 'outletId'>[];
  drinkMenu?: Omit<OutletDrinkMenuInsertType, 'id' | 'workspaceId' | 'outletId'>[];
};

// Parent scalar columns only — outletId, actor and timestamps are set by the repo.
//
// ⚠️ PARTIAL, for the same reason the child lists are optional: a key that is
// absent must keep its stored value. Every one of these columns is
// `.notNull().default(...)`, so omitting them on the INSERT branch is safe — the
// database supplies the same zeros the old `.default()` in the zod schema used
// to, but only for a workspace that is genuinely new.
export type WorkspaceParent = Partial<
  Omit<
    OutletWorkspaceInsertType,
    'id' | 'outletId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
  >
>;

export class OutletWorkspaceRepositoryClass {
  async getByOutletId(
    outletId: string,
  ): Promise<OutletWorkspaceAggregate | null> {
    try {
      const [parent] = await db
        .select()
        .from(OutletWorkspaceTable)
        .where(eq(OutletWorkspaceTable.outletId, outletId))
        .limit(1);
      if (!parent) return null;
      return this.assemble(parent);
    } catch (error) {
      logger.error('[OutletWorkspaceRepository.getByOutletId] Error:', error);
      return null;
    }
  }

  private async assemble(
    parent: OutletWorkspace,
  ): Promise<OutletWorkspaceAggregate> {
    const [tierRates, drinkMenu] = await Promise.all([
      db
        .select()
        .from(OutletTierRateTable)
        .where(eq(OutletTierRateTable.workspaceId, parent.id))
        .orderBy(asc(OutletTierRateTable.sortOrder)),
      db
        .select()
        .from(OutletDrinkMenuTable)
        .where(eq(OutletDrinkMenuTable.workspaceId, parent.id))
        .orderBy(asc(OutletDrinkMenuTable.sortOrder)),
    ]);
    return { ...parent, tierRates, drinkMenu };
  }

  // Create-or-replace the outlet's whole workspace atomically: upsert the parent
  // row (keyed by outlet_id), then replace all child rows. Returns the assembled
  // aggregate.
  async upsertByOutletId(
    outletId: string,
    parent: WorkspaceParent,
    children: WorkspaceChildren,
    actor: string,
  ): Promise<OutletWorkspaceAggregate | null> {
    try {
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: OutletWorkspaceTable.id })
          .from(OutletWorkspaceTable)
          .where(eq(OutletWorkspaceTable.outletId, outletId))
          .limit(1);

        let id: string;
        if (existing) {
          id = existing.id;
          await tx
            .update(OutletWorkspaceTable)
            .set({ ...parent, updatedBy: actor, updatedAt: new Date() })
            .where(eq(OutletWorkspaceTable.id, id));
          // Each list is dropped ONLY when a replacement for it was sent.
          if (children.tierRates !== undefined) {
            await tx
              .delete(OutletTierRateTable)
              .where(eq(OutletTierRateTable.workspaceId, id));
          }
          if (children.drinkMenu !== undefined) {
            await tx
              .delete(OutletDrinkMenuTable)
              .where(eq(OutletDrinkMenuTable.workspaceId, id));
          }
        } else {
          const [row] = await tx
            .insert(OutletWorkspaceTable)
            .values({ ...parent, outletId, createdBy: actor, updatedBy: actor })
            .returning({ id: OutletWorkspaceTable.id });
          id = row!.id;
        }

        if (children.tierRates && children.tierRates.length > 0) {
          await tx
            .insert(OutletTierRateTable)
            .values(
              children.tierRates.map((r) => ({ ...r, workspaceId: id, outletId })),
            );
        }
        if (children.drinkMenu && children.drinkMenu.length > 0) {
          await tx
            .insert(OutletDrinkMenuTable)
            .values(
              children.drinkMenu.map((r) => ({ ...r, workspaceId: id, outletId })),
            );
        }
      });

      return this.getByOutletId(outletId);
    } catch (error) {
      logger.error('[OutletWorkspaceRepository.upsertByOutletId] Error:', error);
      return null;
    }
  }
}
