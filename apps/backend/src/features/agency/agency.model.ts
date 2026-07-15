import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';

export const agencyStatusValues = ['pending_review', 'active', 'inactive', 'suspended'] as const;
export type AgencyStatus = (typeof agencyStatusValues)[number];
export const agencyStatusEnum = MainSchema.enum('agency_status', agencyStatusValues);

export const agencyMemberSubRoleValues = ['owner', 'finance', 'pr'] as const;
export type AgencyMemberSubRole = (typeof agencyMemberSubRoleValues)[number];
export const agencyMemberSubRoleEnum = MainSchema.enum('agency_member_sub_role', agencyMemberSubRoleValues);

export const AgencyTable = MainSchema.table('agency', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  agencyCode: varchar('agency_code', { length: 6 }).notNull().unique(),
  ssmNo: varchar('ssm_no', { length: 100 }).notNull(),
  contactName: varchar('contact_name', { length: 100 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  status: agencyStatusEnum('status').notNull().default('pending_review'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export const AgencyMemberTable = MainSchema.table('agency_member', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyId: uuid('agency_id').notNull().references(() => AgencyTable.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => UserTable.id, { onDelete: 'cascade' }),
  subRole: agencyMemberSubRoleEnum('sub_role').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type AgencyType = typeof AgencyTable.$inferSelect;
export type AgencyInsertType = typeof AgencyTable.$inferInsert;

export type AgencyMemberType = typeof AgencyMemberTable.$inferSelect;
export type AgencyMemberInsertType = typeof AgencyMemberTable.$inferInsert;

export type AgencyFilter = {
  id?: string;
  name?: string;
  agencyCode?: string;
  status?: AgencyStatus;
};
