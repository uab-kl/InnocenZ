import { sql } from 'drizzle-orm';
import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';

export const agencyStatusValues = ['pending_review', 'active', 'inactive', 'suspended'] as const;
export type AgencyStatus = (typeof agencyStatusValues)[number];
export const agencyStatusEnum = MainSchema.enum('agency_status', agencyStatusValues);

/**
 * Agency job titles. Since 0160 these are stored ON the membership row
 * (`agency_user.sub_role`), per organisation. `user_role` now answers only
 * whether the person may open the agency portal at all.
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
   * WHICH JOB TITLE AT THIS AGENCY — owner / finance / director / guarantor.
   *
   * Restored by 0160. It lived here until 0107 moved it to `user_role`, on the
   * reasoning that membership is tenancy only. That was wrong in one specific
   * way: `user_role` has no organisation on it, so the title it held was one
   * per PERSON across every agency they belong to — somebody who is Finance at
   * one agency and Owner at another could not be represented, and changing
   * their title at one rewrote it at the other (owner, 10 Sep 2026: *"they are
   * not always the same position in different orgs"*).
   *
   * `user_role` keeps the OTHER question — may this person open the agency
   * portal at all. The two are not the same and must not be merged again.
   *
   * ⚠️ NOT NULL with NO DEFAULT, deliberately: 0033 warned that losing this
   * distinction would silently promote every finance operator to owner, and a
   * default would do exactly that on any insert that forgets it. Every insert
   * must name the title. Plain varchar, no enum and no CHECK, so adding a lane
   * needs no migration.
   */
  subRole: varchar('sub_role', { length: 50 }).notNull(),
  /**
   * The human-readable id for THIS membership — INN + org code + AGY|OLT + 0001.
   *
   * Per membership, not per person: someone operating two organisations holds a
   * different id in each, because the id names the organisation (0154).
   */
  /**
   * This membership’s id — INNATAGY0001. NOT NULL since 0159.
   *
   * ⚠️ THE DEFAULT IS A PLACEHOLDER, NOT AN ID (0161). A row created at
   * `pending` — somebody who has ASKED to join — takes `INNPND0001` from the
   * database, and only `updateMember` turns that into the organisation's real
   * next number when an owner approves them. Minting the real one at INSERT is
   * what handed a stranger `INNATAGY0005` and burned the number when the
   * request was declined.
   *
   * Declared here as well as in the migration so the insert TYPE knows the
   * column is optional; `pnpm check:drift` is what keeps the two honest.
   */
  memberCode: varchar('member_code', { length: 32 })
    .notNull()
    .default(
      sql`'INNPND' || lpad(nextval('"main"."pending_member_code_seq"')::text, 4, '0')`,
    ),
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
