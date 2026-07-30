/**
 * Manual trigger for the FULL weekly payout job — the same code path the
 * Monday 02:00 cron runs: generate vouchers for the last finished Mon–Sun
 * week, issue every balanced pending_review voucher of that week to its PR
 * ('sent'), notify the PRs, and draft the outlet collection invoices.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/run-weekly-payout.ts
 *
 * Unlike generate-weekly-pvs.ts (generation only, custom windows), this runs
 * the whole rhythm — use it to catch up a missed Monday or to demo the
 * sign-and-history flow without waiting for the cron.
 */
import { runWeeklyPayout } from '@/scheduler/weekly-payout.job.js';

async function main() {
  await runWeeklyPayout();
  process.exit(0);
}

main().catch((error) => {
  console.error('[run-weekly-payout] FAILED:', error);
  process.exit(1);
});
