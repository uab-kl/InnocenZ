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
  /**
   * The agency approved or rejected an overtime claim (migration 0079).
   *
   * PR-addressed, unlike the kind above it. Both halves are needed: without
   * this, a rejected claim just never appears on the voucher, and from where
   * the PR is standing an absence looks exactly like a bug.
   */
  'overtime_decided',
  /** A PR was put on a shift. */
  'shift_assigned',
  /** A shift the PR was on was cancelled or reassigned. */
  'shift_cancelled',
  /** An agency accepted or declined a PR's request to join. */
  'agency_join_resolved',
  /** A PR's average rating fell below the warning threshold (migration 0067). */
  'pr_rating_low',
  /** An outlet asked to cut a shift's cost — waiting on the agency (0098). */
  'cutlost_requested',
  /** The agency approved or rejected that request. Outlet-addressed. */
  'cutlost_decided',
  /**
   * This PR was sent home early by an approved cut-loss (0098). PR-addressed.
   *
   * Deliberately NOT `shift_cancelled`: the shift was not cancelled, it was
   * shortened. They worked part of it and are owed part of the day, and filing
   * this under cancellation would tell them the opposite of what happened.
   */
  'shift_released_early',
  /**
   * A PR dropped out of a shift and the AGENCY needs to find cover (0068).
   * Agency-addressed, like overtime_pending_approval.
   */
  'shift_cover_needed',
  /**
   * The Monday payout job held one or more vouchers because their days have not
   * been reviewed (migration 0073). Agency-addressed, and raised ONE PER AGENCY
   * PER RUN rather than per voucher — a held week can be a dozen vouchers, and
   * twelve notifications saying the same thing is how a bell gets ignored.
   *
   * Exists because the hold was previously a log line only: the queue grew in
   * silence and the first person to notice was a PR asking where their money was.
   */
  'pv_day_review_pending',
  /**
   * A PR filed an MC / leave request and the agency has to decide (0110).
   * Agency-addressed, like shift_cover_needed.
   *
   * Distinct from shift_cover_needed on purpose: nobody is off yet. This is a
   * decision waiting to be made, not a staffing gap — cover is raised later by
   * approveLeave, and only if it approves.
   */
  'leave_requested',
  /**
   * The agency approved or rejected that MC / leave request (0110).
   * PR-addressed — one kind for both outcomes, like cutlost_decided.
   */
  'leave_decided',
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
