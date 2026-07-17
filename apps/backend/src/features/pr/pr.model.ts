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

export type PrFilter = {
  id?: string;
  agencyId?: string;
  status?: PrStatus;
  tier?: PrTier;
  name?: string;
};
