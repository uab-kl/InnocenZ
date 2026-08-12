import { MainSchema } from '@/db/db.schema';
import {
  date,
  numeric,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { penaltyRuleTypeEnum } from '@/features/agency/agency-penalty-rule.model.js';

/**
 * A weekly penalty the agency has SEALED as owed (migration 0117).
 *
 * The three weekly rules are computed from attendance, which means a proposal
 * can be produced any time — but a proposal is not a debt. A row exists here
 * only once an agency has accepted one, which is what lets Finance ask "what
 * have I not billed?" and get an answer that does not re-list a breach it
 * already settled.
 *
 * `fineRm` and `detail` are snapshots of the moment of acceptance: the rule's
 * amounts are editable and the attendance behind them can still move (a late
 * MC approval, a corrected check-out), so re-deriving later would restate a
 * figure someone already signed off.
 */
export const PenaltyChargeTable = MainSchema.table(
  'penalty_charge',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => AgencyTable.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id').notNull(),
    ruleType: penaltyRuleTypeEnum('rule_type').notNull(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    weekEnd: date('week_end', { mode: 'string' }).notNull(),
    fineRm: numeric('fine_rm', { precision: 12, scale: 2 }).notNull().default('0'),
    detail: varchar('detail', { length: 255 }).notNull().default(''),
    /** NULL = owed, not yet billed. The Finance head's whole question. */
    chargedAt: timestamp('charged_at', { withTimezone: true }),
    chargedVoucherId: uuid('charged_voucher_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull().default('system'),
    updatedBy: varchar('updated_by').notNull().default('system'),
  },
  (t) => ({
    // One charge per PR per rule per week — what makes sealing idempotent.
    agencyPrRuleWeek: uniqueIndex('penalty_charge_agency_pr_rule_week_idx').on(
      t.agencyId,
      t.prId,
      t.ruleType,
      t.weekStart,
    ),
  }),
);

export type PenaltyCharge = typeof PenaltyChargeTable.$inferSelect;
export type PenaltyChargeInsertType = typeof PenaltyChargeTable.$inferInsert;
