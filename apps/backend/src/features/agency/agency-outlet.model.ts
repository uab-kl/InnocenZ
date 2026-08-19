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

/**
 * The four states a venue↔agency partnership can be in.
 *
 * `ended` is a CLOSED partnership, not a deleted one, and it is deliberately
 * not the same thing as `rejected`: rejected means the agency never agreed,
 * ended means it did and the arrangement is now over. Both stop new work, but
 * only one of them is a history worth showing a returning partner.
 *
 * Order matches the Postgres enum (migration 0127 appends `ended` last).
 */
export const agencyOutletApproveStatusValues = [
  'pending',
  'approved',
  'rejected',
  'ended',
] as const;
export type AgencyOutletApproveStatus = (typeof agencyOutletApproveStatusValues)[number];

/**
 * WHICH SIDE caused a transition — not which person; `created_by` already
 * carries the individual.
 *
 * The side is what the copy turns on: "ended by the outlet" and "ended by the
 * agency" are the same status and completely different news for whoever is
 * reading it. `system` covers migrations and anything the platform did on its
 * own, so an automated change can never be mistaken for someone's decision.
 */
export const agencyOutletActorSideValues = ['outlet', 'agency', 'admin', 'system'] as const;
export type AgencyOutletActorSide = (typeof agencyOutletActorSideValues)[number];
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

/**
 * Every transition one link has been through (migration 0127). APPEND-ONLY.
 *
 * `agency_outlet` holds the CURRENT state and only that. Re-linking overwrites
 * `approve_status`, so the row alone can never answer "when did we stop working
 * together, the first time" — the question that actually gets asked, months
 * later, when a payment is disputed. History nobody recorded cannot be
 * reconstructed; this table is the cheap version of recording it.
 *
 * This is why there are no `ended_at` / `ended_by` columns on `agency_outlet`:
 * they would hold only the LAST ending, be overwritten by the next one, and
 * restate a fact this table owns.
 *
 * Nothing ever UPDATEs a row here, which is why `updatedAt`/`updatedBy` always
 * equal their `created` twin. They exist because audit columns arrive as a set
 * of four, not because a transition is ever edited.
 */
export const AgencyOutletEventTable = MainSchema.table('agency_outlet_event', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyOutletId: uuid('agency_outlet_id')
    .notNull()
    .references(() => AgencyOutletTable.id, { onDelete: 'cascade' }),
  /**
   * NULL on the first event only — the link did not exist yet, so there was no
   * status to come from. That absence is what makes "requested" identifiable in
   * the timeline, so it is a real value rather than a gap to be filled in.
   */
  fromStatus: agencyOutletApproveStatusEnum('from_status'),
  toStatus: agencyOutletApproveStatusEnum('to_status').notNull(),
  actorSide: varchar('actor_side', { length: 16 })
    .$type<AgencyOutletActorSide>()
    .notNull(),
  /** Reject reason, or why a partnership was ended. Free text, optional. */
  reason: varchar('reason', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type AgencyOutletEventType = typeof AgencyOutletEventTable.$inferSelect;
export type AgencyOutletEventInsertType = typeof AgencyOutletEventTable.$inferInsert;

/** One agency an outlet is linked to — outlet Settings reads this shape. */
export type OutletAgencyLink = {
  /** Link row id — use for approve/reject. */
  id: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  approveStatus: AgencyOutletApproveStatus;
  rejectReason: string | null;
  /**
   * When this partnership was last ended, and by which side.
   *
   * Read from `agency_outlet_event`, never stored here — the link row holds
   * the CURRENT state, and a re-link would overwrite an `ended_at` column
   * while the log keeps every ending. Null on a link that has never ended.
   */
  endedAt: Date | null;
  endedBySide: AgencyOutletActorSide | null;
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
  /**
   * THE RETURNING-PARTNER CONTEXT, read from `agency_outlet_event`.
   *
   * A venue whose link was ended and then requested again arrives back in this
   * queue as plain `pending` — indistinguishable, on the row alone, from a
   * venue the agency has never heard of. That is a worse decision to hand
   * someone than the one they made the first time, because the information
   * that would settle it (we worked together for eight months; they left, or we
   * did) exists and is simply not being shown.
   *
   * All three are null for a link that has never ended.
   */
  firstApprovedAt: Date | null;
  endedAt: Date | null;
  endedBySide: AgencyOutletActorSide | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One transition on a link's timeline, with the agency named for display. */
export type AgencyOutletEventEnriched = {
  id: string;
  fromStatus: AgencyOutletApproveStatus | null;
  toStatus: AgencyOutletApproveStatus;
  actorSide: AgencyOutletActorSide;
  reason: string | null;
  createdAt: Date;
  createdBy: string;
};
