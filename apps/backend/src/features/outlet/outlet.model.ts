import { decimal, integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';
import { AgencyTable } from '@/features/agency/agency.model';

export const outletStatusValues = ['pending_review', 'active', 'inactive', 'suspended'] as const;
export type OutletStatus = (typeof outletStatusValues)[number];
export const outletStatusEnum = MainSchema.enum('outlet_status', outletStatusValues);

export const outletUserSubRoleValues = ['owner', 'finance', 'operations_head'] as const;
export type OutletUserSubRole = (typeof outletUserSubRoleValues)[number];
export const outletUserSubRoleEnum = MainSchema.enum('outlet_user_sub_role', outletUserSubRoleValues);

export const OutletTable = MainSchema.table('outlet', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  logoImage: varchar('logo_image'),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

/** Who can sign into the outlet portal. */
export const OutletUserTable = MainSchema.table('outlet_user', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  outletId: uuid('outlet_id').notNull().references(() => OutletTable.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => UserTable.id, { onDelete: 'cascade' }),
  subRole: outletUserSubRoleEnum('sub_role').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type OutletType = typeof OutletTable.$inferSelect;
export type OutletInsertType = typeof OutletTable.$inferInsert;

export type OutletUserType = typeof OutletUserTable.$inferSelect;
export type OutletUserInsertType = typeof OutletUserTable.$inferInsert;

export type OutletFilter = {
  id?: string;
  name?: string;
  status?: OutletStatus;
  onboardedByAgencyId?: string;
};
