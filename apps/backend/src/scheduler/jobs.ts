import { scheduler } from './scheduler.js';
import { WEEKLY_PAYOUT_JOB } from './weekly-payout.job.js';
import { SUBSCRIPTION_INVOICE_JOB } from './subscription-invoice.job.js';
import { AGENCY_TIER_JOB } from './agency-tier.job.js';
import { NO_SHOW_SWEEP_JOB } from './no-show-sweep.job.js';
import { PENALTY_SEAL_JOB } from './penalty-seal.job.js';

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
  // The only job here that runs on a clock rather than a calendar: an absence
  // becomes a fact a few hours after the shift ends, not once a week.
  scheduler.register(NO_SHOW_SWEEP_JOB);
  // Sunday 08:00, deliberately after the sweep above has resolved Saturday
  // night: it counts COMPLETED shifts, and an overnight shift is not one until
  // its check-out lands. Records breaches as owed; billing stays a human press.
  scheduler.register(PENALTY_SEAL_JOB);
}
