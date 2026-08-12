import { MainSchema } from '@/db/db.schema';
import {
  boolean,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { AgencyTable } from '@/features/agency/agency.model.js';

export const penaltyRuleTypeValues = [
  'min_shifts_per_week',
  'max_mc_per_month',
  'late_per_week',
  'cancellation',
] as const;
export type PenaltyRuleType = (typeof penaltyRuleTypeValues)[number];
export const penaltyRuleTypeEnum = MainSchema.enum(
  'penalty_rule_type',
  penaltyRuleTypeValues,
);

/**
 * Attendance & discipline policy, owned by the AGENCY (see migration 0113).
 *
 * These rules used to hang off `outlet_workspace`, which put the rule with the
 * venue while the money stayed with the employer: a breach becomes a deduction
 * on the agency→PR payment voucher, which the outlet neither pays nor sees. Two
 * of the three rules are not outlet-observable at all — `min_shifts_per_week`
 * counts shifts across every venue a PR worked, and `max_mc_per_month` counts
 * MC that only the agency approves — so per-outlet rules double-fined a PR who
 * split her week between two venues of the same agency.
 *
 * One row per rule type per agency, enforced by a unique index rather than by
 * convention. Rule-specific columns are nullable because each type uses a
 * different subset.
 *
 * Every enabled rule binds EVERY PR on the roster (0114). There is no pay-class
 * target: `enabled` is the only switch, so a rule cannot be on-but-applying-to-
 * nobody, which is what an empty `applies_to` array used to mean.
 */
export const AgencyPenaltyRuleTable = MainSchema.table(
  'agency_penalty_rule',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => AgencyTable.id, { onDelete: 'cascade' }),
    ruleType: penaltyRuleTypeEnum('rule_type').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    fineRm: numeric('fine_rm', { precision: 12, scale: 2 }).notNull().default('0'),
    // min_shifts_per_week
    minShiftsPerWeek: integer('min_shifts_per_week'),
    // max_mc_per_month
    maxMcPerMonth: integer('max_mc_per_month'),
    finePerExcessRm: numeric('fine_per_excess_rm', { precision: 12, scale: 2 }),
    // late_per_week
    maxLatePerWeek: integer('max_late_per_week'),
    graceMinutes: integer('grace_minutes'),
    // cancellation — three notice bands, charged as a PERCENTAGE of the shift's
    // daily wage rather than a flat `fine_rm`. At or above `freeCancelHours` is
    // free; at or above `shortNoticeHours` costs `shortNoticePct`; anything
    // later costs `lateCancelPct`.
    freeCancelHours: integer('free_cancel_hours'),
    shortNoticeHours: integer('short_notice_hours'),
    shortNoticePct: integer('short_notice_pct'),
    lateCancelPct: integer('late_cancel_pct'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull().default('system'),
    updatedBy: varchar('updated_by').notNull().default('system'),
  },
  (t) => ({
    agencyRuleType: uniqueIndex('agency_penalty_rule_agency_rule_type_idx').on(
      t.agencyId,
      t.ruleType,
    ),
  }),
);

export type AgencyPenaltyRule = typeof AgencyPenaltyRuleTable.$inferSelect;
export type AgencyPenaltyRuleInsertType =
  typeof AgencyPenaltyRuleTable.$inferInsert;
