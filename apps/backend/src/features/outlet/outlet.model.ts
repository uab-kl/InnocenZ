import { decimal, integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';
import { AgencyTable } from '@/features/agency/agency.model';

export const outletStatusValues = ['pending_review', 'active', 'inactive', 'suspended'] as const;
export type OutletStatus = (typeof outletStatusValues)[number];
export const outletStatusEnum = MainSchema.enum('outlet_status', outletStatusValues);

/** Portal lane labels (API / UI). Stored on `user_role`→`role`, not `outlet_user`. */
export const outletUserSubRoleValues = ['owner', 'finance', 'operations_head'] as const;
export type OutletUserSubRole = (typeof outletUserSubRoleValues)[number];

export const OutletTable = MainSchema.table('outlet', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  logoImage: varchar('logo_image'),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  postcode: varchar('postcode', { length: 20 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }).default('Malaysia'),
  businessLicense: varchar('business_license', { length: 100 }),
  ssmNo: varchar('ssm_no', { length: 100 }),
  lat: decimal('lat', { precision: 10, scale: 8 }),
  lng: decimal('lng', { precision: 11, scale: 8 }),
  geoFenceRadius: integer('geo_fence_radius').default(50), // metres
  status: outletStatusEnum('status').notNull().default('pending_review'),
  /**
   * ⚠️ HISTORY ONLY — who originally brought this venue onto the platform.
   *
   * Nothing reads it. Routing and visibility both resolve through
   * `agency_outlet` (0123), sign-up no longer sets it, and there is no longer
   * any write path at all, so it stays null for every venue registered after
   * the multi-agency cutover. Kept for the venues that predate it, whose value
   * is a real record; dropping it would be a data-loss migration for nothing.
   *
   * Do not wire anything to this column. If you want "which agencies may staff
   * this venue", that is `AgencyOutletRepository`.
   */
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
  /**
   * VISIBILITY — venues this agency is APPROVED to staff, via `agency_outlet`.
   * This IS the agency portal's outlet list. It replaced an `onboardedByAgencyId`
   * filter that could only ever return the one venue an agency originally
   * signed up; that filter is GONE rather than deprecated, because a future
   * caller would reasonably have read it as "this agency's venues".
   */
  linkedToAgencyId?: string;
};
