import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';

export const agencyStatusValues = ['pending_review', 'active', 'inactive', 'suspended'] as const;
export type AgencyStatus = (typeof agencyStatusValues)[number];
export const agencyStatusEnum = MainSchema.enum('agency_status', agencyStatusValues);

/**
 * Sub-roles of a portal operator. `pr` was removed in migration 0033 — a PR is
 * not a portal user, and the PR-to-agency link lives on `agency_pr`.
 */
export const agencyUserSubRoleValues = ['owner', 'finance'] as const;
export type AgencyUserSubRole = (typeof agencyUserSubRoleValues)[number];
export const agencyUserSubRoleEnum = MainSchema.enum('agency_user_sub_role', agencyUserSubRoleValues);

export const AgencyTable = MainSchema.table('agency', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  agencyCode: varchar('agency_code', { length: 6 }).notNull().unique(),
  ssmNo: varchar('ssm_no', { length: 100 }).notNull(),
  logoImage: varchar('logo_image'),
  contactName: varchar('contact_name', { length: 100 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  // Company address on the ORG (0077 lines + 0098 locality). Not the portal
  // user's home — that only belongs on user_profile for PRs.
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  postcode: varchar('postcode', { length: 20 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }),
  status: agencyStatusEnum('status').notNull().default('pending_review'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

/** Who can sign into the agency portal. PRs are not portal users — see `AgencyPrTable`. */
export const AgencyUserTable = MainSchema.table('agency_user', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyId: uuid('agency_id').notNull().references(() => AgencyTable.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => UserTable.id, { onDelete: 'cascade' }),
  subRole: agencyUserSubRoleEnum('sub_role').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type AgencyType = typeof AgencyTable.$inferSelect;
export type AgencyInsertType = typeof AgencyTable.$inferInsert;

export type AgencyUserType = typeof AgencyUserTable.$inferSelect;
export type AgencyUserInsertType = typeof AgencyUserTable.$inferInsert;

export type AgencyFilter = {
  id?: string;
  name?: string;
  agencyCode?: string;
  status?: AgencyStatus;
};
