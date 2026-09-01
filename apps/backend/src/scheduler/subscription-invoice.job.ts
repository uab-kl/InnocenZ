import { subscriptionInvoiceRepository } from '@/composition-root.js';
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
}

export const SUBSCRIPTION_INVOICE_JOB: JobDefinition = {
  name: 'subscription-invoice',
  schedule: SCHEDULE,
  run: runSubscriptionInvoices,
};
