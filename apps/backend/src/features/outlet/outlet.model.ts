import { decimal, integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { SubscriptionTable } from '@/features/subscription/subscription.model';

export const outletStatusValues = ['pending_review', 'active', 'inactive', 'suspended'] as const;
export type OutletStatus = (typeof outletStatusValues)[number];
export const outletStatusEnum = MainSchema.enum('outlet_status', outletStatusValues);

export const outletMemberSubRoleValues = ['owner', 'finance', 'operations_head'] as const;
export type OutletMemberSubRole = (typeof outletMemberSubRoleValues)[number];
export const outletMemberSubRoleEnum = MainSchema.enum('outlet_member_sub_role', outletMemberSubRoleValues);

export const OutletTable = MainSchema.table('outlet', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  postcode: varchar('postcode', { length: 20 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }).default('Malaysia'),
  businessLicense: varchar('business_license', { length: 100 }),
  ssmNo: varchar('ssm_no', { length: 100 }),
  lat: decimal('lat', { precision: 10, scale: 8 }),
  lng: decimal('lng', { precision: 11, scale: 8 }),
  geoFenceRadius: integer('geo_fence_radius').default(50), // metres
  status: outletStatusEnum('status').notNull().default('pending_review'),
  onboardedByAgencyId: uuid('onboarded_by_agency_id').references(() => AgencyTable.id, { onDelete: 'set null' }),
  subscriptionId: uuid('subscription_id').references(() => SubscriptionTable.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export const OutletMemberTable = MainSchema.table('outlet_member', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  outletId: uuid('outlet_id').notNull().references(() => OutletTable.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => UserTable.id, { onDelete: 'cascade' }),
  subRole: outletMemberSubRoleEnum('sub_role').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type OutletType = typeof OutletTable.$inferSelect;
export type OutletInsertType = typeof OutletTable.$inferInsert;

export type OutletMemberType = typeof OutletMemberTable.$inferSelect;
export type OutletMemberInsertType = typeof OutletMemberTable.$inferInsert;

export type OutletFilter = {
  id?: string;
  name?: string;
  status?: OutletStatus;
  onboardedByAgencyId?: string;
  subscriptionId?: string;
};
