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
  /**
   * The money for that voucher actually left the agency (migration 0141).
   *
   * PR-addressed, and the counterpart the bell was missing: 'issued' told them
   * a figure existed, 'dispute_resolved' told them an argument ended, and
   * nothing told them they had been PAID. Raised only on a genuine
   * signed -> paid transition — never for a re-settlement of a voucher that was
   * already paid, or the notification stops being believed.
   */
  'payment_voucher_paid',
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
  /**
   * An agency sent a free-text notice to PRs it selected off its own roster
   * (migration 0126). PR-addressed, and the only kind here that is UNSOLICITED
   * — every other one answers something that happened to the recipient.
   *
   * Carries no object id in `payload`, only `{ agencyId }` for attribution:
   * there is nothing to open. A reader must route it to the inbox and must not
   * try to resolve it to a shift or a voucher.
   */
  'agency_broadcast',
  /**
   * The agency's weekly subscription statement (migration 0136):
   * how many PVs it issued last payroll week, and the tier that put it on.
   *
   * Agency-addressed, owner + finance only, and ONE PER AGENCY PER RUN — the
   * same shape as `pv_day_review_pending`, for the same reason.
   *
   * Raised on EVERY run, including the weeks nothing moved. That looks like the
   * repetition the note on `pv_day_review_pending` warns against and is the
   * opposite: the PV count is different every week and it is the number the
   * invoice is computed from, so this is a statement rather than a repeated
   * alarm. A tier that held steady is itself the answer to "what am I paying
   * this week", and only sending it on a CHANGE would mean the weeks an agency
   * most wants to check are the weeks it hears nothing.
   *
   * Carries `{ weekStart, weekEnd, pvCount, planName, outcome }`. There is no
   * object to open — the agency's own Subscription page is the destination —
   * so a reader must route it there and must not resolve it to a voucher.
   */
  'subscription_tier_weekly',
  /**
   * A new billing period was opened against this organisation (migration 0137).
   *
   * Outlet AND agency addressed — the first kind here that goes to both — owner
   * + finance only, and ONE PER ORGANISATION PER RUN rather than per lane. A
   * venue holding a plan and a POS add-on opens two invoices on the same night,
   * and two notices for one night's billing is how a bell gets ignored.
   *
   * Distinct from `subscription_tier_weekly` above, which an outlet never
   * receives and which says what a week's PV count did to a PRICE. This one says
   * a CHARGE now exists. An agency that stayed on the same tier still gets a new
   * weekly invoice, so the two are not interchangeable in either direction.
   *
   * Carries `{ periodStart, periodEnd, amount, currency, count }` — a TOTAL and
   * how many lanes made it, never a single invoice id, because there may be two.
   * There is nothing to open; the org's own Subscription page is the
   * destination, so a reader must route it there.
   */
  'subscription_invoice_opened',
  /**
   * An AUTOMATIC charge of a bill to the org's saved card or linked e-wallet
   * failed (migration 0166) — insufficient balance, an expired card, a revoked
   * link. The bill stays unpaid and must be paid by hand.
   *
   * Owner + finance, ONE PER FAILED INVOICE: unlike a night's opened bills, a
   * failed charge is a specific amount the org now has to act on, and it is
   * rare. Never raised for a bill that is retried and succeeds, because the job
   * does not retry — the next bill is charged afresh.
   *
   * Carries `{ invoiceId, invoiceNo, amount, currency, periodStart, periodEnd,
   * methodType, reason }`. The org's Subscription page is the destination.
   */
  'subscription_autopay_failed',
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
