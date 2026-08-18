import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';

/**
 * ⚠️ LEAF MODULE — declared here rather than in `agency.model.ts` on purpose.
 *
 * `outlet.model.ts` (line 30) already imports `AgencyTable` for the
 * `onboarded_by_agency_id` FK. Putting this table in `agency.model.ts` would
 * make that file import `OutletTable` back, closing an
 * `agency.model → outlet.model → agency.model` cycle. A latent import cycle has
 * already taken the entire agency portal down in this repo once; this module
 * imports both sides and is itself imported only by its repository, so it
 * cannot close a loop.
 */

export const agencyOutletApproveStatusValues = ['pending', 'approved', 'rejected'] as const;
export type AgencyOutletApproveStatus = (typeof agencyOutletApproveStatusValues)[number];
export const agencyOutletApproveStatusEnum = MainSchema.enum(
  'agency_outlet_approve_status',
  agencyOutletApproveStatusValues,
);

/**
 * Agency ↔ outlet fulfilment relationship (migration 0123).
 *
 * The LIVE answer to "may this agency staff this venue", as opposed to
 * `outlet.onboarded_by_agency_id`, which is now only the historical "who
 * brought this venue in". One outlet has many rows here; one agency has many.
 * Nothing behavioural may read `onboarded_by_agency_id` again — routing and
 * visibility both resolve through this table.
 *
 * Deliberately the same shape as `agency_pr`: a venue asking to work with an
 * agency is the same act as a PR asking to join one, approved once and then
 * used freely. Keeping the two mechanisms identical means the approvals screen,
 * the reject reason and the pending/approved/rejected vocabulary are learned
 * once, not twice.
 *
 * Identity is joined from `agency` / `outlet` — never duplicated here.
 */
export const AgencyOutletTable = MainSchema.table('agency_outlet', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => AgencyTable.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id')
    .notNull()
    .references(() => OutletTable.id, { onDelete: 'cascade' }),
  approveStatus: agencyOutletApproveStatusEnum('approve_status').notNull().default('pending'),
  /** Why the agency declined this venue's request to link. */
  rejectReason: varchar('reject_reason', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type AgencyOutletType = typeof AgencyOutletTable.$inferSelect;
export type AgencyOutletInsertType = typeof AgencyOutletTable.$inferInsert;

/** One agency an outlet is linked to — outlet Settings reads this shape. */
export type OutletAgencyLink = {
  /** Link row id — use for approve/reject. */
  id: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  approveStatus: AgencyOutletApproveStatus;
  rejectReason: string | null;
};

/** One venue on an agency's linking queue — the Outlet-Linking tab reads this. */
export type AgencyOutletEnriched = {
  id: string;
  agencyId: string;
  outletId: string;
  outletName: string;
  approveStatus: AgencyOutletApproveStatus;
  rejectReason: string | null;
  city: string | null;
  state: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postcode: string | null;
  country: string | null;
  logoImage: string | null;
  /**
   * The VENUE's own lifecycle state (`pending_review` / `active` / …), which is
   * NOT this link's `approveStatus`. An agency deciding whether to take a venue
   * on wants to know it is still awaiting platform review — that changes
   * whether approving it means anything yet.
   */
  outletStatus: string;
  /** Company registration, for an agency checking the venue is a real business. */
  ssmNo: string | null;
  businessLicense: string | null;
  /**
   * True when this link predates the multi-agency cutover — i.e. it came from
   * `onboarded_by_agency_id` via migration 0123 rather than from a venue
   * actually asking. Lets the Outlet-Linking tab avoid presenting long-standing
   * partners as if they were new requests.
   */
  fromOnboarding: boolean;
  createdAt: Date;
  updatedAt: Date;
};
