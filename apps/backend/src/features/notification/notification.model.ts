import { MainSchema } from '@/db/db.schema';
import { jsonb, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { UserTable } from '@/features/user/user.model.js';

/**
 * What a notification is ABOUT. Deliberately a closed enum rather than free text:
 * the recipient's UI groups and routes by kind, and a typo in a string literal
 * would silently produce an un-routable notification.
 *
 * Only kinds with a real producer today are listed. Add one when the code that
 * raises it lands, not before — an enum value with no writer reads like a feature
 * that exists.
 */
export const notificationKindValues = [
  /** A weekly voucher was generated for this PR. */
  'payment_voucher_issued',
  /** The agency accepted or rejected a dispute the PR raised. */
  'payment_voucher_dispute_resolved',
  /** Overtime is waiting on agency approval — see the OT rules. */
  'overtime_pending_approval',
  /** A PR was put on a shift. */
  'shift_assigned',
  /** A shift the PR was on was cancelled or reassigned. */
  'shift_cancelled',
  /** An agency accepted or declined a PR's request to join. */
  'agency_join_resolved',
] as const;
export type NotificationKind = (typeof notificationKindValues)[number];
export const notificationKindEnum = MainSchema.enum('notification_kind', notificationKindValues);

/**
 * One in-app notification for one user.
 *
 * IN-APP ONLY, and that is a constraint rather than a first cut: there is no
 * mailer in this system at all (password reset only logs its link) and no
 * WhatsApp/SMS sender. A row here is the whole delivery. When a transport does
 * arrive it reads from this table rather than replacing it, so nothing that
 * calls notify() has to change.
 *
 * Recipient is the `user` FK, never a copied name or email — the PR/agency/outlet
 * identity hangs off that row and copies go stale.
 */
export const NotificationTable = MainSchema.table('notification', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  // Cascade: a deleted user's notifications are meaningless, and keeping them
  // would strand rows pointing at nothing.
  userId: uuid('user_id')
    .references(() => UserTable.id, { onDelete: 'cascade' })
    .notNull(),
  kind: notificationKindEnum('kind').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  /**
   * Whatever the reader needs to act on this — e.g. `{ voucherId }` or
   * `{ shiftAssignmentId }`. Deliberately NOT a set of nullable FK columns: every
   * new kind would add another mostly-null column to every row.
   */
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  /** Null until read. A timestamp rather than a boolean so "when" survives. */
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type Notification = typeof NotificationTable.$inferSelect;
export type NotificationInsertType = typeof NotificationTable.$inferInsert;
