import { logger } from '@/util/logger.js';
import {
  agencyMemberRepository,
  paymentVoucherGenerator,
  paymentVoucherRepository,
  prRepository,
  collectionInvoiceRepository,
} from '@/composition-root.js';
import { klToday, previousCompleteWeek } from '@/features/payment-voucher/payment-voucher-week.js';
import { checkVoucherBalance } from '@/features/payment-voucher/payment-voucher-balance.js';
import {
  buildDayReviewView,
  voucherSendGate,
} from '@/features/payment-voucher/payment-voucher-day-review.js';
import { notify, notifyMany } from '@/features/notification/notify.js';
import type { JobDefinition } from './scheduler.js';

/** Stamped into the generated vouchers' audit columns. */
const ACTOR = 'weekly-payout-job';

// `klToday` used to be defined here, character for character. It now lives beside
// `previousCompleteWeek` in payment-voucher-week.ts, because the send gate needs
// the same answer and two copies of "what day is it in KL" is exactly the kind of
// pair that drifts apart unnoticed.

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

  // …and the same summary for vouchers that BALANCE but disagree with the
  // records behind them — wages for an unworked day, a line outside the week,
  // overtime the stamps cannot justify, a duplicated order, a sibling voucher.
  // Reported separately from the block above because the two mean different
  // things: broken arithmetic, versus correct arithmetic over wrong inputs.
  // Also deliberately non-aborting, for the same reason.
  if (result.unreconciled.length > 0) {
    logger.error(
      `[weekly-payout] ${result.unreconciled.length} voucher(s) DO NOT RECONCILE against their source records — hold payment and review:`,
    );
    for (const bad of result.unreconciled) {
      logger.error(`[weekly-payout]   ${bad.voucherId}: ${bad.problems.join('; ')}`);
    }
  }

  // APPROVED -> VERIFIED, the rollover arm of the receipt lifecycle.
  //
  // Runs BEFORE the issue pass below, and that order is the point: the gate
  // refuses a voucher with a PENDING receipt, so if the rollover ran afterwards
  // a week's receipts would spend an extra seven days at 'approved' before
  // closing — a whole cadence skipped, every week, invisibly.
  //
  // Scoped by `week_start <= weekStart`, so a voucher held back for a fortnight
  // still rolls over when it clears. Vouchers with an open dispute are skipped
  // inside the repository: verified means closed, and closing evidence under a
  // live claim would settle it out from under the PR.
  try {
    const verified = await paymentVoucherRepository.verifyApprovedReceipts({
      throughWeekStart: weekStart,
      actor: ACTOR,
    });
    logger.info(
      `[weekly-payout] receipts: ${verified.length} approved receipt(s) rolled over to verified` +
        (verified.length > 0
          ? ` (${verified.slice(0, 10).join(', ')}${verified.length > 10 ? ', …' : ''})`
          : ''),
    );
  } catch (error) {
    // A receipt left at 'approved' rolls over next Monday. It must not cost the
    // PRs the vouchers and notifications below.
    logger.error('[weekly-payout] receipt rollover failed:', error);
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
  /** agencyId -> the vouchers this run refused to send, for one notification each. */
  const awaitingByAgency = new Map<string, string[]>();
  let held = 0;
  let awaitingReview = 0;
  for (const voucher of pending) {
    const balance = checkVoucherBalance(voucher, voucher.lines);
    if (!balance.balanced) {
      held += 1;
      logger.error(
        `[weekly-payout] holding ${voucher.id} at pending_review: ${balance.problems.join('; ')}`,
      );
      continue;
    }

    // The same gate the HTTP send uses. Applied here deliberately: this job is
    // how vouchers actually reach PRs, so exempting it would leave the agency's
    // day-by-day sign-off as something the scheduler overrules every Monday.
    // Consequence to expect on the first run after this shipped: vouchers stay
    // at pending_review until an agency reviews them, which is the point.
    const reviews = await paymentVoucherRepository.listDayReviews(voucher.id);
    // Receipts as well as days: a receipt the agency never looked at holds the
    // week here exactly as it does at the HTTP send. Same gate, same message.
    const receipts = await paymentVoucherRepository.listReceipts(voucher.id);
    // The week-finished rule is passed here too, even though this job runs on
    // `previousCompleteWeek` and can therefore never trip it. That is the point:
    // a gate the scheduler is exempted from is a gate with an unguarded way
    // around it, and if the week arithmetic ever drifts, the job says so on a
    // Monday instead of quietly issuing a voucher for days nobody has worked.
    const gate = voucherSendGate(buildDayReviewView(voucher.lines, reviews), receipts, {
      weekEnd: voucher.weekEnd,
      today: klToday(),
    });
    if (!gate.allowed) {
      awaitingReview += 1;
      logger.warn(`[weekly-payout] awaiting agency day review ${voucher.id}: ${gate.message}`);
      // Collected per agency so ONE notification below can name the whole queue.
      // A log line was the only signal before, which meant nobody was told at all.
      awaitingByAgency.set(voucher.agencyId, [
        ...(awaitingByAgency.get(voucher.agencyId) ?? []),
        voucher.id,
      ]);
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
      (held > 0 ? ` (${held} held for agency review)` : '') +
      (awaitingReview > 0 ? ` (${awaitingReview} awaiting day-by-day review)` : ''),
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

  // Tell each agency what this run would not send.
  //
  // Without this the hold is invisible: the job writes a log line nobody reads,
  // the voucher sits at pending_review, and the PR is never notified either — so
  // the first sign of a stuck week is somebody asking where their money is. The
  // day-review panel shows the queue to whoever goes looking; this is what makes
  // them look.
  //
  // ONE notification per agency naming a count, not one per voucher: a held week
  // can be a dozen vouchers, and a dozen identical bells is how a bell gets
  // ignored.
  //
  // Addressed to owner + finance only, mirroring the agencyOwnerOrFinance guard on
  // the review routes — telling somebody about a queue they are not permitted to
  // clear is noise. The sub-role enum happens to be exactly owner|finance today,
  // so this filter is a no-op right now; it is written down so a third sub-role
  // does not silently inherit money notifications.
  for (const [agencyId, voucherIds] of awaitingByAgency) {
    try {
      const members = await agencyMemberRepository.listByAgency(agencyId);
      const recipients = members
        .filter((m) => m.status === 'active')
        .filter((m) => m.subRole === 'owner' || m.subRole === 'finance')
        .map((m) => m.userId);
      if (recipients.length === 0) {
        logger.warn(
          `[weekly-payout] ${voucherIds.length} voucher(s) awaiting review at agency ${agencyId} with no owner/finance member to tell`,
        );
        continue;
      }

      const count = voucherIds.length;
      await notifyMany(recipients, {
        kind: 'pv_day_review_pending',
        title: `${count} voucher${count === 1 ? '' : 's'} awaiting day review`,
        body:
          `Week ${weekStart} to ${weekEnd} did not go out: ${count} voucher${count === 1 ? '' : 's'} ` +
          `${count === 1 ? 'has a day that is' : 'have days that are'} held or unreviewed. ` +
          `Approve each day on Payroll & PV, then send.`,
        payload: { weekStart, weekEnd, voucherIds },
        actor: ACTOR,
      });
    } catch (error) {
      // The vouchers are correctly held either way; failing to announce it must
      // not make the run look failed or cost the PR notifications above.
      logger.error(`[weekly-payout] could not notify agency ${agencyId} of held vouchers:`, error);
    }
  }

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
