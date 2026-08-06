import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import { RoleTable } from '@/features/rbac/role/role.model';

/**
 * Pending team invite (email + token + expires). Membership rows on
 * outlet_user / agency_user are written only when status becomes `accepted`.
 */
export const orgMemberInviteStatusValues = [
  'pending',
  'accepted',
  'cancelled',
  'expired',
] as const;
export type OrgMemberInviteStatus = (typeof orgMemberInviteStatusValues)[number];

export const OrgMemberInviteTable = MainSchema.table('org_member_invite', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  /** sha256 hex of the secret in the email link. */
  token: varchar('token', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  outletId: uuid('outlet_id').references(() => OutletTable.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').references(() => AgencyTable.id, { onDelete: 'cascade' }),
  /** Portal role (`outlet` / `agency`) — read name via FK. */
  roleId: uuid('role_id')
    .notNull()
    .references(() => RoleTable.id),
  /** Membership lane: owner | finance | operations_head. */
  subRole: varchar('sub_role', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  acceptedUserId: uuid('accepted_user_id').references(() => UserTable.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type OrgMemberInviteType = typeof OrgMemberInviteTable.$inferSelect;
export type OrgMemberInviteInsertType = typeof OrgMemberInviteTable.$inferInsert;
