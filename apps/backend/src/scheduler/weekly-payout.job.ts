import { logger } from '@/util/logger.js';
import {
  agencyMemberRepository,
  paymentVoucherGenerator,
  paymentVoucherRepository,
  prRepository,
  shiftAssignmentRepository,
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
 * Sundays at 02:00 Asia/Kuala_Lumpur — after the last Saturday shift has
 * certainly been checked out, and while nobody is looking at the vouchers.
 *
 * Moved from Monday with the payroll week's re-anchor to Sun–Sat (3 Aug 2026,
 * owner's instruction). The cron day and the week anchor are ONE decision: a
 * Sun–Sat week ends Saturday, so a Monday run would issue every voucher a day
 * late and fire in the middle of the next week rather than at its start. Sunday
 * is also what "PV issued every Sunday" — the copy on four PR and agency
 * screens — has always promised.
 */
const SCHEDULE = '0 2 * * 0';

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
  /**
   * agencyId -> the vouchers this run refused to send, SPLIT BY WHY, so one
   * notification per agency can name the action actually owed. Still one per
   * agency per run: see `pv_day_review_pending`'s own note on why twelve
   * notifications saying the same thing is how a bell gets ignored.
   */
  const awaitingByAgency = new Map<string, { dayReview: string[]; unsigned: string[] }>();
  const heldFor = (agencyId: string) => {
    const bucket = awaitingByAgency.get(agencyId) ?? { dayReview: [], unsigned: [] };
    awaitingByAgency.set(agencyId, bucket);
    return bucket;
  };
  let held = 0;
  let awaitingReview = 0;
  let awaitingSignature = 0;
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
    // Overtime too, and this job is where the rule actually bites: it is the
    // path by which a week normally closes, so an undecided claim held here is
    // what keeps overtime on the voucher of the week it was worked.
    const pendingOvertime =
      voucher.prId && voucher.weekStart && voucher.weekEnd
        ? await shiftAssignmentRepository.listPendingOvertimeForPrWeek({
            prId: voucher.prId,
            fromDate: voucher.weekStart,
            toDate: voucher.weekEnd,
          })
        : [];
    const gate = voucherSendGate(
      buildDayReviewView(voucher.lines, reviews),
      receipts,
      { weekEnd: voucher.weekEnd, today: klToday() },
      pendingOvertime,
    );
    if (!gate.allowed) {
      awaitingReview += 1;
      logger.warn(`[weekly-payout] awaiting agency day review ${voucher.id}: ${gate.message}`);
      // Collected per agency so ONE notification below can name the whole queue.
      // A log line was the only signal before, which meant nobody was told at all.
      heldFor(voucher.agencyId).dayReview.push(voucher.id);
      continue;
    }

    // THE FINANCE SIGNATURE — the other half of the send gate, and the half
    // `voucherSendGate` has no term for. The HTTP send 409s on exactly this
    // (payment-voucher.controller.ts: "Sign this voucher first — the finance
    // signature is what the PR is asked to counter-sign"), so leaving it out
    // here made the scheduler a way around the agency's own attestation.
    //
    // It is not a rare edge. `financeSignVoucher` refuses any voucher that is
    // not `pending_review`, and signing only becomes legal at 00:00 Sunday —
    // so this job, running at 02:00 the same night, was the DEFAULT path.
    // `finance_head_signed_at` then stayed null forever: every exported PDF
    // and Excel printed an empty finance stamp, and the PR was asked to
    // counter-sign a wage document nobody at the agency had attested.
    //
    // Held, not sent. The voucher stays `pending_review` — which is the only
    // status finance can still sign from — and the agency is told below.
    if (!voucher.financeHeadSignedAt) {
      awaitingSignature += 1;
      logger.warn(
        `[weekly-payout] awaiting finance signature ${voucher.id} (agency ${voucher.agencyId})`,
      );
      heldFor(voucher.agencyId).unsigned.push(voucher.id);
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
      (awaitingReview > 0 ? ` (${awaitingReview} awaiting day-by-day review)` : '') +
      (awaitingSignature > 0 ? ` (${awaitingSignature} awaiting finance signature)` : ''),
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
  for (const [agencyId, buckets] of awaitingByAgency) {
    try {
      const members = await agencyMemberRepository.listByAgency(agencyId);
      const recipients = members
        .filter((m) => m.status === 'active')
        .filter((m) => m.subRole === 'owner' || m.subRole === 'finance')
        .map((m) => m.userId);
      if (recipients.length === 0) {
        logger.warn(
          `[weekly-payout] ${buckets.dayReview.length + buckets.unsigned.length} voucher(s) held at agency ${agencyId} with no owner/finance member to tell`,
        );
        continue;
      }

      // Two reasons a week can be held, and the agency needs to know WHICH:
      // a day review is a decision on the PR's logged money, a signature is
      // finance attesting the finished voucher. Telling someone to "review"
      // when the days are already approved sends them looking for work that
      // is not there. Reusing the `pv_day_review_pending` kind rather than
      // adding an enum value: `kind` is a pgEnum, a new value needs a
      // migration, and this kind's own note already scopes it to "the Monday
      // payout job held one or more vouchers", agency-addressed, one per run.
      const reviewCount = buckets.dayReview.length;
      const signCount = buckets.unsigned.length;
      const voucherIds = [...buckets.dayReview, ...buckets.unsigned];
      const total = voucherIds.length;
      if (total === 0) continue;

      const plural = (n: number) => (n === 1 ? '' : 's');
      const title =
        signCount > 0 && reviewCount === 0
          ? `${signCount} voucher${plural(signCount)} waiting for your signature`
          : reviewCount > 0 && signCount === 0
            ? `${reviewCount} voucher${plural(reviewCount)} awaiting day review`
            : `${total} voucher${plural(total)} need review or signature`;

      const parts: string[] = [];
      if (reviewCount > 0) {
        parts.push(
          `${reviewCount} ${reviewCount === 1 ? 'has a day that is' : 'have days that are'} held or unreviewed — approve each day on Payroll & PV`,
        );
      }
      if (signCount > 0) {
        parts.push(
          `${signCount} ${signCount === 1 ? 'is' : 'are'} reviewed but unsigned — finance has to sign before ${signCount === 1 ? 'it' : 'they'} can reach the PR`,
        );
      }

      await notifyMany(recipients, {
        kind: 'pv_day_review_pending',
        title,
        body:
          `Last week (${weekStart} to ${weekEnd}) did not go out: ${parts.join('; ')}. ` +
          `Until then the PR sees nothing for that week.`,
        payload: {
          weekStart,
          weekEnd,
          voucherIds,
          dayReviewVoucherIds: buckets.dayReview,
          unsignedVoucherIds: buckets.unsigned,
        },
        actor: ACTOR,
      });
    } catch (error) {
      // The vouchers are correctly held either way; failing to announce it must
      // not make the run look failed or cost the PR notifications above.
      logger.error(`[weekly-payout] could not notify agency ${agencyId} of held vouchers:`, error);
    }
  }

  // Collections (what an outlet owes its agency) are NOT drafted here any more.
  //
  // Owner's decision, 12 Aug 2026: the outlet and the agency settle that between
  // themselves, outside this app. Auto-drafting an invoice per outlet every week
  // put an app-derived figure — `sum(shift_assignment.pay_amount)`, with no
  // agency margin in it — in front of two parties who are billing each other on
  // their own terms, and offered a "Mark settled" button for a payment nothing
  // here can verify.
  //
  // Only the WRITE is gone. `collection_invoice`, its API and both portals' read
  // screens are untouched, so rows already raised still show and can still be
  // issued/settled by hand. Restoring the automation is putting this block back:
  // `weeklyOutletTotals(weekStart, weekEnd)` then `draftForWeek(...)`, which is
  // idempotent per (agency, outlet, week).
  //
  // ⚠️ Before ever re-enabling it, read the note on the one Monday-anchored row
  // (`collection_invoice 57f8cbd2…`, Velvet 23, 20–26 Jul, settled): it does not
  // collide with either Sun–Sat week it straddles, so a catch-up run over late
  // July would bill that venue a second time for work already paid for.
}

export const WEEKLY_PAYOUT_JOB: JobDefinition = {
  name: 'weekly-payout',
  schedule: SCHEDULE,
  run: runWeeklyPayout,
};
