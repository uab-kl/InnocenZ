import { scheduler } from './scheduler.js';
import { WEEKLY_PAYOUT_JOB } from './weekly-payout.job.js';
import { SUBSCRIPTION_INVOICE_JOB } from './subscription-invoice.job.js';
import { AGENCY_TIER_JOB } from './agency-tier.job.js';

/**
 * Every background job in the system, in one list.
 *
 * Jobs are registered here rather than self-registering on import, so that what
 * runs in the background is answerable by reading one file instead of grepping
 * for import side effects.
 *
 * Phase C builds the machinery; the jobs that will live here are Phase E and
 * beyond — the weekly payout sweep (`payment_voucher` rows are already derived
 * weekly, but nothing triggers that on a schedule yet) and whatever reminder
 * passes the notification table ends up feeding.
 */
export function registerJobs(): void {
  // The scheduler already guards overlap and swallows throws, so a job body only
  // has to do its own work.
  scheduler.register(WEEKLY_PAYOUT_JOB);
  scheduler.register(SUBSCRIPTION_INVOICE_JOB);
  scheduler.register(AGENCY_TIER_JOB);
}
