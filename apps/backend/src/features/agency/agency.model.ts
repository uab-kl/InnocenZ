import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';

export const agencyStatusValues = ['pending_review', 'active', 'inactive', 'suspended'] as const;
export type AgencyStatus = (typeof agencyStatusValues)[number];
export const agencyStatusEnum = MainSchema.enum('agency_status', agencyStatusValues);

/**
 * Sub-roles of a portal operator (API / UI labels). Stored on `user_role`→`role`,
 * not on `agency_user` — membership is tenancy only.
 */
export const agencyUserSubRoleValues = [
  'owner',
  'finance',
  /** View only, under the owner. */
  'director',
  /** Stands in for the owner, at owner level — including paying PRs. */
  'guarantor',
] as const;
export type AgencyUserSubRole = (typeof agencyUserSubRoleValues)[number];

export const AgencyTable = MainSchema.table('agency', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  agencyCode: varchar('agency_code', { length: 6 }).notNull().unique(),
  /**
   * The letter code member ids are built from — INN + <this> + AGY + 0001.
   *
   * NOT : that column already holds a registration number for one
   * live agency and an out-of-sequence value for another, so ids built on it
   * would read as INN120219AGY0001. Auto-suggested from the name, editable by
   * an admin, and frozen once any member holds an id (0154).
   */
  memberCodePrefix: varchar('member_code_prefix', { length: 8 }),
  ssmNo: varchar('ssm_no', { length: 100 }).notNull(),
  logoImage: varchar('logo_image'),
  // The old-format registration number. The venue table has always had one;
  // the agency’s was collected and discarded until 0155.
  businessLicense: varchar('business_license', { length: 100 }),
  registrationNoOld: varchar('registration_no_old', { length: 50 }),
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
  status: varchar('status', { length: 50 }).notNull().default('active'),
  /**
   * The human-readable id for THIS membership — INN + org code + AGY|OLT + 0001.
   *
   * Per membership, not per person: someone operating two organisations holds a
   * different id in each, because the id names the organisation (0154).
   */
  /** This membership’s id — INNATAGY0001. NOT NULL since 0159; `add()`
      always mints one and throws rather than writing without it. */
  memberCode: varchar('member_code', { length: 32 }).notNull(),
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
