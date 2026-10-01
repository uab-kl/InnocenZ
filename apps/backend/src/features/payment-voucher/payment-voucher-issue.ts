import type { PaymentVoucherStatus } from './payment-voucher.model';
import { paymentDueDate } from './payment-voucher-week.js';

/**
 * WHAT A VOUCHER CARRIES OUT OF THE AGENCY'S HANDS, AND WHO IS TOLD.
 *
 * Two doors move a voucher to `sent`: the Sunday issue pass and the agency's own
 * "Send to PR" (PUT /payment-voucher/:id, one voucher or a bulk selection). Only
 * the first stamped a date and rang the PR's bell. A manual send left
 * `issued_date` NULL — the printed voucher read "Voucher Date: —" — and the PR
 * learned about the voucher only by opening the app. "Mark as paid" had the same
 * gap: the payout-batch lane told the PR they were paid, the one-voucher button
 * did not. The live database held 8 sent/signed/paid vouchers and not one
 * `payment_voucher_issued` or `payment_voucher_paid` notification (28 Sep 2026).
 *
 * Pure, so both doors share one rule and the rule is tested without a database.
 */

/**
 * The dates a voucher takes on leaving review — ONLY the ones it lacks.
 *
 * Never re-dates: a voucher issued once keeps its issued date through a dispute
 * and a re-send, and a due date already written (the generator writes one at
 * creation) is the date the PR was told. The due date is anchored to the week,
 * never to the send, for the reason `paymentDueDate` records — the same week
 * must not acquire two deadlines depending on when somebody pressed a button.
 */
export function issueStamps(
  voucher: {
    issuedDate: string | null;
    dueDate: string | null;
    weekEnd: string | null;
  },
  today: string,
): { issuedDate?: string; dueDate?: string } {
  const stamps: { issuedDate?: string; dueDate?: string } = {};
  if (!voucher.issuedDate) stamps.issuedDate = today;
  if (!voucher.dueDate && voucher.weekEnd) {
    const due = paymentDueDate(voucher.weekEnd);
    if (due) stamps.dueDate = due;
  }
  return stamps;
}

/** Just enough of a voucher to word a notice about it. */
export type NoticeVoucher = {
  id: string;
  voucherNo: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  net: string;
};

export type VoucherNotice = {
  kind: 'payment_voucher_issued' | 'payment_voucher_paid';
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

/**
 * "Your voucher is ready" — the PR's cue to review and sign.
 *
 * English on the wire: the app rebuilds the sentence in the reader's language
 * from `payload.weekStart`/`weekEnd` (notification-copy.ts), so the payload keys
 * are the contract and must not move.
 */
export function issuedNotice(
  voucher: NoticeVoucher,
  opts: { resent?: boolean } = {},
): VoucherNotice {
  return {
    kind: 'payment_voucher_issued',
    // `resent` is how the app words the reminder in the reader's language.
    title: opts.resent ? 'Reminder: your payment voucher is waiting' : 'Your payment voucher is ready',
    body:
      voucher.weekStart && voucher.weekEnd
        ? `Week ${voucher.weekStart} to ${voucher.weekEnd}. Check the amounts and raise a dispute if anything is wrong.`
        : 'Check the amounts and raise a dispute if anything is wrong.',
    payload: {
      voucherId: voucher.id,
      voucherNo: voucher.voucherNo,
      weekStart: voucher.weekStart,
      weekEnd: voucher.weekEnd,
      ...(opts.resent ? { resent: true } : {}),
    },
  };
}

/** "You have been paid" — the same words the payout-batch lane has always used. */
export function paidNotice(voucher: NoticeVoucher): VoucherNotice {
  return {
    kind: 'payment_voucher_paid',
    title: 'You have been paid',
    body: `${voucher.voucherNo ?? 'Your voucher'} — RM ${voucher.net} has been transferred to your bank.`,
    payload: {
      voucherId: voucher.id,
      voucherNo: voucher.voucherNo,
      amount: voucher.net,
    },
  };
}

/**
 * Which notice, if any, a status change owes the PR.
 *
 * TRANSITIONS, plus one deliberate repeat. `paid → paid` is the bank reference
 * being attached later — ringing for it would teach the PR to ignore the bell,
 * which is the rule the `payment_voucher_paid` kind was added under.
 *
 * `sent → sent` IS the agency's "Resend to PR", and the owner wants it to ring
 * (29 Sep 2026: "yes"): a reminder, flagged `resent`. A double-click or a
 * retried request is not a second reminder — the notification layer drops a
 * notice identical to the PR's latest unread one within two minutes
 * (repeat-delivery.ts).
 *
 * `disputed → sent` counts: the agency has settled the argument and handed the
 * voucher back to be signed, which is exactly what the PR has to be told.
 */
export function voucherStatusNotice(
  from: PaymentVoucherStatus,
  to: PaymentVoucherStatus | undefined,
  voucher: NoticeVoucher,
): VoucherNotice | null {
  if (to === 'sent' && (from === 'pending_review' || from === 'disputed')) {
    return issuedNotice(voucher);
  }
  if (to === 'sent' && from === 'sent') return issuedNotice(voucher, { resent: true });
  if (to === 'paid' && from === 'signed') return paidNotice(voucher);
  return null;
}

/**
 * The account to notify: the voucher's payee key.
 *
 * `user_id` first (0087); `pr_id` equals it on every row since 0089, and is
 * only the fallback for a row that predates the dual-write.
 */
export function voucherPayeeUserId(voucher: {
  userId?: string | null;
  prId?: string | null;
}): string | null {
  return voucher.userId ?? voucher.prId ?? null;
}
