import { sql } from 'drizzle-orm';
import { decimal, integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';
import { AgencyTable } from '@/features/agency/agency.model';

export const outletStatusValues = ['pending_review', 'active', 'inactive', 'suspended'] as const;
export type OutletStatus = (typeof outletStatusValues)[number];
export const outletStatusEnum = MainSchema.enum('outlet_status', outletStatusValues);

/**
 * Portal lane labels (API / UI). Stored on `user_role`→`role`, not `outlet_user`.
 *
 * `director` is view-only, `guarantor` is owner-equal — see `portalRoleName`.
 * The lane is persisted as a plain `varchar(50)` with no CHECK constraint and no
 * enum, so adding one needs no migration.
 */
export const outletUserSubRoleValues = [
  'owner',
  'finance',
  'operations_head',
  'director',
  'guarantor',
] as const;
export type OutletUserSubRole = (typeof outletUserSubRoleValues)[number];

export const OutletTable = MainSchema.table('outlet', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  /** Letter code venue member ids are built from — INN + <this> + OLT + 0001 (0154). */
  memberCodePrefix: varchar('member_code_prefix', { length: 8 }),
  logoImage: varchar('logo_image'),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  postcode: varchar('postcode', { length: 20 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }).default('Malaysia'),
  /** The licence to trade — asked for outright at sign-up, NOT the old-format
      registration number that used to be written here. */
  businessLicense: varchar('business_license', { length: 100 }),
  ssmNo: varchar('ssm_no', { length: 100 }),
  registrationNoOld: varchar('registration_no_old', { length: 50 }),
  // Asked at sign-up since the form existed; they had nowhere to land until
  // 0155, so a venue’s contact person, email and phone were read and dropped.
  contactName: varchar('contact_name', { length: 100 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
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
  /**
   * WHICH JOB TITLE AT THIS VENUE — owner / finance / operations_head /
   * director / guarantor. The agency twin's note explains why it lives here
   * rather than on `user_role`; see AgencyUserTable.subRole.
   *
   * ⚠️ NOT NULL with NO DEFAULT. Every insert must name the title.
   */
  subRole: varchar('sub_role', { length: 50 }).notNull(),
  /**
   * The human-readable id for THIS membership — INN + org code + AGY|OLT + 0001.
   *
   * Per membership, not per person: someone operating two organisations holds a
   * different id in each, because the id names the organisation (0154).
   */
  /**
   * This membership’s id — INNEMOLT0001. NOT NULL since 0159.
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
  /**
   * WHEN THIS PERSON FIRST JOINED — written once, never rewritten (0163).
   *
   * NULL means they have never been on the team: a request still waiting, or
   * one that was turned down. A timestamp means an approval actually
   * happened, whatever the row says today.
   *
   * ⚠️ This is what tells a DECLINED applicant from a DEACTIVATED colleague
   * when somebody is removed. That used to be deduced from the member id —
   * sound, but it made one rule depend on another written in five places,
   * and a former colleague re-labelled "never a member" is the kind of
   * mistake nobody notices until it is already on a screen.
   *
   * ⚠️ NOT part of the audit quartet: `updated_at` churns on every edit;
   * this does not move after the first activation.
   */
  firstActivatedAt: timestamp('first_activated_at', { withTimezone: true }),
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
  /**
   * TENANT SCOPE — the venues this caller may see at all, forced by the
   * controller and never read from the query string.
   *
   * `GET /outlet` had no tenant term whatsoever: omit `linkedToAgencyId` and
   * every ACTIVE venue on the platform came back, carrying `addressLine1`,
   * `ssmNo`, `businessLicense` and the geo-fence pin, to any outlet or agency
   * token — and `pageSize` is unclamped, so it was a bulk export. A role gate
   * is not a scope check.
   *
   * An empty array means "no venues", which is the right answer for a caller
   * who belongs to none. `undefined` means unscoped and is reachable only for
   * an admin.
   */
  outletIds?: string[];
  /**
   * EVERY venue this agency has ever been linked to — any `approve_status`, and
   * with no date bound.
   *
   * Distinct from `linkedToAgencyId`, which deliberately narrows to partnerships
   * that are approved OR ended-but-still-carrying-future-work. That is the right
   * answer for "which venues may I staff", and the wrong one for "what is this
   * venue called": the agency portal's Roster, auto-assign and roster-slots all
   * fetch this list purely as an id→name map, so once a partnership ended and
   * its last shift passed, the week grid printed a raw 36-character UUID where
   * "Velvet 23" belongs — in the one view an operator uses to reconstruct past
   * work.
   *
   * Still strictly the caller's OWN partners, so it leaks nothing: it widens
   * across time, not across tenants.
   */
  everLinkedToAgencyId?: string;
};
