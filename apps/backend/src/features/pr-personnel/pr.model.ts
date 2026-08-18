/**
 * Feature folder: `pr-personnel` (not `pr`).
 * `main.pr` was dropped — this module owns the synthetic PR identity + `agency_pr`
 * membership model. HTTP stays at `/api/v1/pr`. Membership writes live in
 * `features/agency/agency-pr.repository.ts`.
 */
import { integer, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { UserTable } from '@/features/user/user.model';

export const prTierValues = [
  'tier_1',
  'tier_2',
  'tier_3',
  'tier_4',
  'tier_5',
  'servant',
  'commission_only',
] as const;
export type PrTier = (typeof prTierValues)[number];
export const prTierEnum = MainSchema.enum('pr_tier', prTierValues);

export const prStatusValues = ['active', 'inactive', 'pending', 'suspended'] as const;
export type PrStatus = (typeof prStatusValues)[number];
export const prStatusEnum = MainSchema.enum('pr_status', prStatusValues);

/**
 * `main.pr` is GONE (migration 0095 dropped it after remapping every ops
 * `pr_id` column to equal `user_id`). There is no more `pr` row and no more
 * standalone PR identity: a PR **is** a `user` account that holds the `pr`
 * role (`user_role` ⋈ `role`), so `id === userId` on every value shaped like
 * this, always. Nothing below is a drizzle table — it is a plain type
 * describing the SYNTHETIC row `PrRepository` builds on the fly from `user` +
 * `user_profile` + `agency_pr` (name/nickname from the account, tier/status
 * from the membership — one fact, one table, per the database rule). Keep the
 * field list identical to the old table so every existing caller of `PrType`
 * keeps compiling untouched.
 */
export type PrType = {
  /** Always equal to `userId` post-cutover. */
  id: string;
  agencyId: string;
  userId: string;
  name: string;
  nickname: string | null;
  tier: PrTier;
  status: PrStatus;
  rejectReason: string | null;
  phone: string | null;
  email: string | null;
  icNo: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** Synthetic rows are built, not inserted — kept only for callers that still reference the shape. */
export type PrInsertType = Omit<PrType, 'createdAt' | 'updatedAt'> & {
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * Membership lifecycle (0125 added the two departure states — same shape 0049
 * gave shift_assignment its MC/leave flow):
 *   pending       -> PR asked to join; agency must approve.
 *   approved      -> under the agency.
 *   rejected      -> join declined (reject_reason says why).
 *   leave_pending -> an APPROVED PR asked to LEAVE and awaits the agency's
 *                    approval. Only reachable once everything between the two
 *                    is settled — vouchers paid, disputes closed, no upcoming
 *                    or unfinished shifts (listLeaveBlockers, re-checked on
 *                    the agency's approve).
 *   left          -> departure approved. The row is KEPT, never deleted: the
 *                    approvals page reads it as history, and the unique
 *                    (agency_id, user_id) key means a re-join flips this same
 *                    row back to 'pending' instead of inserting.
 * A REJECTED departure returns the row to 'approved' with reject_reason
 * prefixed '[Leave rejected] ' — there is no third value for it.
 */
export const agencyPrApproveStatusValues = [
  'pending',
  'approved',
  'rejected',
  'leave_pending',
  'left',
] as const;
export type AgencyPrApproveStatus = (typeof agencyPrApproveStatusValues)[number];
export const agencyPrApproveStatusEnum = MainSchema.enum('agency_pr_approve_status', agencyPrApproveStatusValues);

/**
 * Agency ↔ PR-account membership. Source of truth for join approval + tier
 * (migration 0085 user_id key, 0087 tier/reject_reason). Person identity is
 * joined from `user` / `user_profile` — never duplicated here.
 */
export const AgencyPrTable = MainSchema.table(
  'agency_pr',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => AgencyTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => UserTable.id, { onDelete: 'cascade' }),
    approveStatus: agencyPrApproveStatusEnum('approve_status').notNull().default('pending'),
    /** Per-agency rate class — moved off `pr.tier` (0087). */
    tier: prTierEnum('tier').notNull().default('tier_1'),
    /** Why the agency declined this membership request. */
    rejectReason: varchar('reject_reason', { length: 500 }),
    // Roster-profile columns (0089). Grade the PR *under this agency* — a PR on
    // two rosters can hold two different values. Never on a person table.
    place: varchar('place', { length: 120 }),
    yearsExp: integer('years_exp'),
    /** 'A' | 'B' | 'C' — validated in UpdatePrSchema, not by a pg enum. */
    kpiTier: varchar('kpi_tier', { length: 8 }),
    /** 'basic' | 'commission_only' — validated in UpdatePrSchema. */
    payClass: varchar('pay_class', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => [unique('agency_pr_agency_id_user_id_unique').on(table.agencyId, table.userId)],
);

export type AgencyPrType = typeof AgencyPrTable.$inferSelect;
export type AgencyPrInsertType = typeof AgencyPrTable.$inferInsert;

export type PrProfile = {
  profileImage: string | null;
  gender: string | null;
  race: string | null;
  /**
   * ISO date, `YYYY-MM-DD`. DERIVED on read: the date encoded in the PR's NRIC
   * when it has one, else the stored `user_profile.dob`. Not editable through
   * the PR update route — see `UpdatePrSchema`.
   */
  dob: string | null;
  /**
   * Whole years, counted from `dob` above. Read-only on both portals: age
   * follows the IC, so there is nothing here for either side to set.
   */
  age: number | null;
  nationality: string | null;
  /** Spoken languages the PR set on their own profile, e.g. ['English','Hokkien']. */
  languages: string[] | null;
  // Matches the user_profile.portfolio_photos jsonb column, which infers as a
  // nullable array of nullable strings (drizzle's conservative jsonb typing).
  portfolioPhotos: (string | null)[] | null;
  /** Saved auto-generated photo comcard path on the linked user_profile. */
  comcardImage: string | null;
  comcardHeightCm: number | null;
  comcardWeightKg: number | null;
  comcardBustCm: number | null;
  comcardWaistCm: number | null;
  comcardHipCm: number | null;
};

/**
 * How the PR's own agency grades them — the `agency_pr` half of the roster
 * profile (0089). Null when the PR has no link row for that agency yet.
 */
export type PrRoster = {
  place: string | null;
  yearsExp: number | null;
  kpiTier: string | null;
  payClass: string | null;
};

/**
 * A PR's live performance figures, derived (never stored) from this agency's
 * `shift_assignment` and `payment_voucher` rows. See `pr-stats.ts` for the
 * counting rule and why `attendancePct` may be null.
 *
 * Present on the LIST read path only, and only for callers entitled to it — an
 * outlet may not read an agency's payroll, so it never receives this.
 */
export type PrStatsType = {
  attendancePct: number | null;
  completedShifts: number;
  missedShifts: number;
  excusedShifts: number;
  totalPaidRm: number;
};

/** A `pr` row with the linked user's comcard profile and roster grading folded in. */
export type PrWithProfileType = PrType & {
  profile: PrProfile | null;
  roster: PrRoster | null;
  /** Absent (not zeroed) when the caller is not entitled to it — see PrStatsType. */
  stats?: PrStatsType;
};

export type PrFilter = {
  id?: string;
  agencyId?: string;
  status?: PrStatus;
  tier?: PrTier;
  name?: string;
  /**
   * Restricts to PRs rostered on a shift at one of these outlets — how an outlet
   * caller sees the personnel working its own venues without seeing an agency's
   * whole roster. An empty array matches nothing.
   */
  assignedToOutletIds?: string[];
  /**
   * Drops memberships still awaiting the agency's decision
   * (`agency_pr.approve_status = 'pending'`).
   *
   * A pending row is an APPLICATION, not a roster member — the agency has not
   * accepted this PR yet. Every non-admin read of this endpoint sets it, because
   * the roster screens (Manage PR, the roster grid, the assign dialog,
   * auto-assign) all listed applicants as active staff and offered them for
   * shifts. The Approvals queue reads `GET /agency/:id/pr` instead, so it is
   * unaffected; a caller here that genuinely wants applicants asks for them by
   * name with `?status=pending`.
   */
  excludePending?: boolean;
};
