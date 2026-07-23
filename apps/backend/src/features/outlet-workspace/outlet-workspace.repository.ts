import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  OutletDrinkMenuInsertType,
  OutletDrinkMenuTable,
  OutletPenaltyRuleInsertType,
  OutletPenaltyRuleTable,
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
  tierRates: Omit<OutletTierRateInsertType, 'id' | 'workspaceId' | 'outletId'>[];
  drinkMenu: Omit<OutletDrinkMenuInsertType, 'id' | 'workspaceId' | 'outletId'>[];
  penaltyRules: Omit<OutletPenaltyRuleInsertType, 'id' | 'workspaceId'>[];
};

// Parent scalar columns only — outletId, actor and timestamps are set by the repo.
export type WorkspaceParent = Omit<
  OutletWorkspaceInsertType,
  'id' | 'outletId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
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
    const [tierRates, drinkMenu, penaltyRules] = await Promise.all([
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
      db
        .select()
        .from(OutletPenaltyRuleTable)
        .where(eq(OutletPenaltyRuleTable.workspaceId, parent.id)),
    ]);
    return { ...parent, tierRates, drinkMenu, penaltyRules };
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
          await tx
            .delete(OutletTierRateTable)
            .where(eq(OutletTierRateTable.workspaceId, id));
          await tx
            .delete(OutletDrinkMenuTable)
            .where(eq(OutletDrinkMenuTable.workspaceId, id));
          await tx
            .delete(OutletPenaltyRuleTable)
            .where(eq(OutletPenaltyRuleTable.workspaceId, id));
        } else {
          const [row] = await tx
            .insert(OutletWorkspaceTable)
            .values({ ...parent, outletId, createdBy: actor, updatedBy: actor })
            .returning({ id: OutletWorkspaceTable.id });
          id = row!.id;
        }

        if (children.tierRates.length > 0) {
          await tx
            .insert(OutletTierRateTable)
            .values(
              children.tierRates.map((r) => ({ ...r, workspaceId: id, outletId })),
            );
        }
        if (children.drinkMenu.length > 0) {
          await tx
            .insert(OutletDrinkMenuTable)
            .values(
              children.drinkMenu.map((r) => ({ ...r, workspaceId: id, outletId })),
            );
        }
        if (children.penaltyRules.length > 0) {
          await tx
            .insert(OutletPenaltyRuleTable)
            .values(
              children.penaltyRules.map((r) => ({ ...r, workspaceId: id })),
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
