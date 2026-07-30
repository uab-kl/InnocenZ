import { logger } from '@/util/logger.js';
import {
  paymentVoucherGenerator,
  paymentVoucherRepository,
  prRepository,
  collectionInvoiceRepository,
} from '@/composition-root.js';
import { previousCompleteWeek } from '@/features/payment-voucher/payment-voucher-week.js';
import { checkVoucherBalance } from '@/features/payment-voucher/payment-voucher-balance.js';
import { notify } from '@/features/notification/notify.js';
import type { JobDefinition } from './scheduler.js';

/** Stamped into the generated vouchers' audit columns. */
const ACTOR = 'weekly-payout-job';

/** Today's calendar date in Kuala Lumpur (UTC+8, no DST), for issued_date stamps. */
function klToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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

  // Issue: every voucher for the closed week still at 'pending_review' —
  // whether generated seconds ago or accumulated live while the PR logged
  // receipts during the week — is sent to the PR for signature ("one week,
  // one PV"). Without this pass nothing ever left pending_review, so the
  // Payment "Last week" sign button could never appear. A voucher whose money
  // does not balance stays held at pending_review for the agency to fix first.
  const pending = await paymentVoucherRepository.listForWeek(weekStart, ['pending_review']);
  const issuedDate = klToday();
  const issued: { voucherId: string; prId: string | null }[] = [];
  let held = 0;
  for (const voucher of pending) {
    const balance = checkVoucherBalance(voucher, voucher.lines);
    if (!balance.balanced) {
      held += 1;
      logger.error(
        `[weekly-payout] holding ${voucher.id} at pending_review: ${balance.problems.join('; ')}`,
      );
      continue;
    }
    const sent = await paymentVoucherRepository.update(voucher.id, {
      status: 'sent',
      issuedDate: voucher.issuedDate ?? issuedDate,
      updatedBy: ACTOR,
    });
    if (sent) issued.push({ voucherId: voucher.id, prId: voucher.prId });
  }
  logger.info(
    `[weekly-payout] issued ${issued.length} voucher(s) to PRs` +
      (held > 0 ? ` (${held} held for agency review)` : ''),
  );

  let notified = 0;
  let unlinked = 0;

  for (const created of issued) {
    const pr = created.prId ? await prRepository.getById(created.prId) : null;
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
    `[weekly-payout] notified ${notified}/${issued.length}` +
      (unlinked > 0 ? ` (${unlinked} PR rows have no user account yet)` : ''),
  );

  // Collections: what each outlet owes its agency for the same week. DRAFTS
  // only — an agency reviews and issues, nothing is put in front of an outlet
  // automatically, and this app never moves the money either way.
  //
  // Derived from shift assignments rather than the vouchers just generated: a
  // voucher snapshots one outlet name, so a PR who worked two venues would bill
  // whichever came first. Same completed-work rule, different grouping.
  try {
    const totals = await collectionInvoiceRepository.weeklyOutletTotals(weekStart, weekEnd);
    const drafted = await collectionInvoiceRepository.draftForWeek(
      totals,
      weekStart,
      weekEnd,
      ACTOR,
    );
    logger.info(
      `[weekly-payout] collections: ${totals.length} outlet total(s), ${drafted.length} drafted` +
        (drafted.length < totals.length
          ? ` (${totals.length - drafted.length} already existed — re-run, left untouched)`
          : ''),
    );
  } catch (error) {
    // Vouchers are the payroll obligation and are already committed; a failure
    // to draft a receivable must not cost the PRs their notification or make
    // the run look failed.
    logger.error('[weekly-payout] collections drafting failed:', error);
  }
}

export const WEEKLY_PAYOUT_JOB: JobDefinition = {
  name: 'weekly-payout',
  schedule: SCHEDULE,
  run: runWeeklyPayout,
};
