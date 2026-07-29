import { logger } from '@/util/logger.js';
import { paymentVoucherGenerator, prRepository } from '@/composition-root.js';
import { previousCompleteWeek } from '@/features/payment-voucher/payment-voucher-week.js';
import { notify } from '@/features/notification/notify.js';
import type { JobDefinition } from './scheduler.js';

/** Stamped into the generated vouchers' audit columns. */
const ACTOR = 'weekly-payout-job';

/**
 * Mondays at 02:00 Asia/Kuala_Lumpur — after the last Sunday shift has certainly
 * been checked out, and while nobody is looking at the vouchers.
 */
const SCHEDULE = '0 2 * * 1';

/**
 * Rolls the week that just ended into one payment voucher per PR per agency, and
 * tells each PR the voucher exists.
 *
 * The generation itself is not new — PaymentVoucherGeneratorClass already did
 * this and was reachable only by running a script by hand, which meant vouchers
 * were "generated weekly" in design and never in fact. This is the trigger.
 *
 * Safe to re-run: the generator skips any PR+week that already has a voucher, so
 * a retry, a double tick, or a manual run on the same window creates nothing new.
 */
export async function runWeeklyPayout(): Promise<void> {
  const { weekStart, weekEnd } = previousCompleteWeek();
  logger.info(`[weekly-payout] generating for ${weekStart}..${weekEnd}`);

  const result = await paymentVoucherGenerator.generateForWeek({
    weekStart,
    weekEnd,
    actor: ACTOR,
  });

  logger.info(
    `[weekly-payout] ${result.agenciesProcessed} agencies · ${result.created.length} created · ${result.skipped.length} skipped`,
  );

  // Σ=0. The generator has already flagged and logged each one; this is the
  // summary a human actually reads. Deliberately does NOT abort the run: the
  // remaining PRs still need telling about the vouchers that are fine, and an
  // unbalanced voucher sits at 'pending_review' where an agency reviews it
  // before any money moves.
  if (result.imbalanced.length > 0) {
    logger.error(
      `[weekly-payout] ${result.imbalanced.length} voucher(s) DO NOT BALANCE — hold payment and review:`,
    );
    for (const bad of result.imbalanced) {
      logger.error(`[weekly-payout]   ${bad.voucherId}: ${bad.problems.join('; ')}`);
    }
  }

  let notified = 0;
  let unlinked = 0;

  for (const created of result.created) {
    const pr = await prRepository.getById(created.prId);
    // pr.userId is nullable — a PR row can exist before anyone has signed up for
    // it. There is no account to notify, and that is not an error.
    if (!pr?.userId) {
      unlinked += 1;
      continue;
    }

    // No tx: the voucher is already committed by the generator, so tying the
    // notification to a transaction here would buy nothing. notify() never
    // throws, so a failed notification cannot undo a real voucher.
    const row = await notify({
      userId: pr.userId,
      kind: 'payment_voucher_issued',
      title: 'Your payment voucher is ready',
      body: `Week ${weekStart} to ${weekEnd}. Check the amounts and raise a dispute if anything is wrong.`,
      payload: { voucherId: created.voucherId, weekStart, weekEnd },
      actor: ACTOR,
    });
    if (row) notified += 1;
  }

  logger.info(
    `[weekly-payout] notified ${notified}/${result.created.length}` +
      (unlinked > 0 ? ` (${unlinked} PR rows have no user account yet)` : ''),
  );
}

export const WEEKLY_PAYOUT_JOB: JobDefinition = {
  name: 'weekly-payout',
  schedule: SCHEDULE,
  run: runWeeklyPayout,
};
