import { scheduler } from './scheduler.js';

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
  // Intentionally empty. Add with:
  //
  //   scheduler.register({
  //     name: 'weekly-payout',
  //     schedule: '0 2 * * 1',   // Mondays 02:00 Asia/Kuala_Lumpur
  //     run: () => paymentVoucherGenerator.runWeekly(),
  //   });
  //
  // The scheduler already guards overlap and swallows throws, so a job body only
  // has to do its own work.
  void scheduler;
}
