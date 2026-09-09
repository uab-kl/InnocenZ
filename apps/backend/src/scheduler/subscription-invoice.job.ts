import {
  memberSubscriptionRepository,
  subscriptionInvoiceRepository,
} from '@/composition-root.js';
import { announceOpenedInvoices } from '@/features/subscription-invoice/announce-opened.js';
import { logger } from '@/util/logger.js';
import { SYSTEM_ACTOR } from '@/util/actor.js';
import type { JobDefinition } from './scheduler.js';

/**
 * Opens the billing periods that have started, so the admin's Plan Payment page
 * always has a row to mark paid.
 *
 * DAILY, not weekly or monthly, because the two cycles do not share a tick: an
 * agency's week opens every Sunday, while each outlet's month opens on the day
 * of the month it subscribed — and a 5-field cron cannot say "the 31st, clamped
 * to month length". A daily pass asks the period rule itself which subscriptions
 * have reached a new period, and the generator is idempotent, so on the other
 * days it writes nothing.
 *
 * 03:00 KL — after the Sunday 02:00 payout job, so the two are never contending
 * on the one night they both run.
 */
const SCHEDULE = '0 3 * * *';

async function runSubscriptionInvoices(): Promise<void> {
  const result = await subscriptionInvoiceRepository.generateMissing({ actor: SYSTEM_ACTOR });
  // Logged even at zero: this job's normal outcome IS zero, and a silent job is
  // indistinguishable from one that stopped running.
  logger.info(
    `[subscription-invoice] scanned ${result.scanned} subscription(s), opened ${result.created} new period(s)`,
  );

  /**
   * And tell whoever now owes it.
   *
   * Runs AFTER the log line rather than inside the generator, so a billing run
   * that succeeded is recorded as having succeeded even if every notification
   * then fails. The announcer never throws, so this cannot cost the run either
   * way — but the ordering keeps the two facts separable when reading the log.
   *
   * The admin's "Refresh periods" button calls the same announcer, or which door
   * opened the period would decide whether the payer heard about it.
   */
  const told = await announceOpenedInvoices(result.opened);
  if (result.created > 0) {
    logger.info(`[subscription-invoice] told ${told} organisation(s) about a new bill`);
  }

  /**
   * AND THE ONE THING THIS JOB CANNOT FIX BY RUNNING AGAIN.
   *
   * Every other gap heals here: a morning the job missed, a period nobody
   * opened, a notification that failed — the next pass picks them all up,
   * because the lane carries an anchor and the generator walks from it. An org
   * whose anchor was never written is the exception. `generateMissing` skips an
   * unanchored lane BY DESIGN (that is how a pending org avoids being billed),
   * so a live org that reaches this state is skipped for ever and no amount of
   * re-running changes it.
   *
   * Which makes it precisely the failure that has to be spoken aloud. Orgs have
   * already existed in this system holding no subscription at all, and what let
   * that run for weeks was not the failed write — it was that nothing ever asked
   * the question afterwards. This asks it, every morning.
   *
   * NOT repaired automatically: stamping `now` would bill the org from the day
   * this reconciliation happened to notice, not the day it was approved. A wrong
   * date written silently is worse than a real problem named loudly.
   */
  const unanchored = await memberSubscriptionRepository.listApprovedWithoutBillingAnchor();
  if (unanchored.length > 0) {
    logger.error(
      `[subscription-invoice] ⚠️ ${unanchored.length} APPROVED organisation(s) have no billing ` +
        'anchor and are being invoiced by nothing — repair by setting member_subscription.' +
        `billing_starts_at to the day each was approved: ${unanchored
          .map((org) => `${org.subscriberType} "${org.subscriberName}" (${org.subscriberId})`)
          .join(', ')}`,
    );
  }
}

export const SUBSCRIPTION_INVOICE_JOB: JobDefinition = {
  name: 'subscription-invoice',
  schedule: SCHEDULE,
  run: runSubscriptionInvoices,
};
