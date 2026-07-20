import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { UserTable } from '@/features/user/user.model';

export const prTierValues = ['tier_1', 'tier_2', 'tier_3'] as const;
export type PrTier = (typeof prTierValues)[number];
export const prTierEnum = MainSchema.enum('pr_tier', prTierValues);

export const prStatusValues = ['active', 'inactive', 'pending', 'suspended'] as const;
export type PrStatus = (typeof prStatusValues)[number];
export const prStatusEnum = MainSchema.enum('pr_status', prStatusValues);

/** PR / personnel — a worker managed by an agency, optionally linked to a user account. */
export const PrTable = MainSchema.table('pr', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => AgencyTable.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => UserTable.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  nickname: varchar('nickname', { length: 100 }),
  tier: prTierEnum('tier').notNull().default('tier_1'),
  status: prStatusEnum('status').notNull().default('active'),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  icNo: varchar('ic_no', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type PrType = typeof PrTable.$inferSelect;
export type PrInsertType = typeof PrTable.$inferInsert;

/**
 * Comcard / identity fields that live on the linked user account rather than on
 * the `pr` row itself — the same source the admin PR screen reads. Read-only
 * here; the PR portal owns the writes. Every field is null when the PR has no
 * `userId`, or no `user_profile` row yet.
 */
export type PrProfile = {
  profileImage: string | null;
  gender: string | null;
  race: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  dob: string | null;
  nationality: string | null;
  portfolioPhotos: string[] | null;
  comcardHeightCm: number | null;
  comcardWeightKg: number | null;
};

/** A `pr` row with the linked user's comcard profile folded in. */
export type PrWithProfileType = PrType & { profile: PrProfile | null };

export type PrFilter = {
  id?: string;
  agencyId?: string;
  status?: PrStatus;
  tier?: PrTier;
  name?: string;
  /**
   * Restricts to PRs rostered on a shift at one of these outlets — how an outlet
   * caller sees the personnel working its own venues without seeing an agency's
   * whole roster. An empty array matches nothing.
   */
  assignedToOutletIds?: string[];
};
