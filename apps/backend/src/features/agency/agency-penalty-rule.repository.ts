import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  AgencyPenaltyRule,
  AgencyPenaltyRuleInsertType,
  AgencyPenaltyRuleTable,
} from '@/features/agency/agency-penalty-rule.model.js';

/** A rule as supplied by a caller — the agency, actor and id are the repo's. */
export type PenaltyRuleInput = Omit<
  AgencyPenaltyRuleInsertType,
  'id' | 'agencyId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>;

export class AgencyPenaltyRuleRepositoryClass {
  async listByAgencyId(agencyId: string): Promise<AgencyPenaltyRule[]> {
    try {
      return await db
        .select()
        .from(AgencyPenaltyRuleTable)
        .where(eq(AgencyPenaltyRuleTable.agencyId, agencyId))
        .orderBy(asc(AgencyPenaltyRuleTable.ruleType));
    } catch (error) {
      logger.error('[AgencyPenaltyRuleRepository.listByAgencyId] Error:', error);
      throw error;
    }
  }

  /**
   * Create-or-replace an agency's whole rule set atomically.
   *
   * A full replacement rather than a per-row merge: the editor always submits
   * all three rules, and a rule that vanishes from the payload means "no longer
   * enforced", which a merge would silently keep alive. Deleting first also
   * keeps the (agency_id, rule_type) unique index satisfied without needing an
   * upsert path per rule type.
   */
  async replaceForAgency(
    agencyId: string,
    rules: PenaltyRuleInput[],
    actor: string,
  ): Promise<AgencyPenaltyRule[]> {
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(AgencyPenaltyRuleTable)
          .where(eq(AgencyPenaltyRuleTable.agencyId, agencyId));
        if (rules.length > 0) {
          await tx.insert(AgencyPenaltyRuleTable).values(
            rules.map((r) => ({
              ...r,
              agencyId,
              createdBy: actor,
              updatedBy: actor,
            })),
          );
        }
      });
      return this.listByAgencyId(agencyId);
    } catch (error) {
      logger.error('[AgencyPenaltyRuleRepository.replaceForAgency] Error:', error);
      throw error;
    }
  }
}
