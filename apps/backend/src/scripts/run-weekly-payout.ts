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
// FIRST, before the job: importing it pulls in composition-root, which builds the
// pg pool — and without the env loaded it builds from unset credentials and dies
// at the first query with "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must
// be a string", an error naming the auth mechanism rather than the cause.
// generate-weekly-pvs.ts had the identical defect (fixed 31 Jul).
import '@/env.js';
import { runWeeklyPayout } from '@/scheduler/weekly-payout.job.js';

async function main() {
  await runWeeklyPayout();
  process.exit(0);
}

main().catch((error) => {
  console.error('[run-weekly-payout] FAILED:', error);
  process.exit(1);
});
