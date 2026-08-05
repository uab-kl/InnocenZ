import { timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
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
 * `main.pr` is GONE (migration 0089 dropped it after remapping every ops
 * `pr_id` column to equal `user_id`). There is no more `pr` row and no more
 * standalone PR identity: a PR **is** a `user` account, so `id === userId`
 * on every value shaped like this, always. Nothing below is a drizzle table —
 * it is a plain type describing the SYNTHETIC row `PrRepository` builds on the
 * fly from `user` + `user_profile` + `agency_pr` (name/nickname from the
 * account, tier/status from the membership — one fact, one table, per the
 * database rule). Keep the field list identical to the old table so every
 * existing caller of `PrType` keeps compiling untouched.
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

export const agencyPrApproveStatusValues = ['pending', 'approved', 'rejected'] as const;
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => [unique('agency_pr_agency_id_user_id_unique').on(table.agencyId, table.userId)],
);

export type AgencyPrType = typeof AgencyPrTable.$inferSelect;
export type AgencyPrInsertType = typeof AgencyPrTable.$inferInsert;

/**
 * Comcard / identity fields that live on the linked user account rather than on
 * the `pr` row itself — the same source the admin PR screen reads. Read-only
 * here; the PR portal owns the writes. Every field is null when the PR has no
 * `userId`, or no `user_profile` row yet.
 */
export type PrProfile = {
  profileImage: string | null;
  gender: string | null;
  race: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  dob: string | null;
  nationality: string | null;
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

/** A `pr` row with the linked user's comcard profile folded in. */
export type PrWithProfileType = PrType & { profile: PrProfile | null };

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
};
