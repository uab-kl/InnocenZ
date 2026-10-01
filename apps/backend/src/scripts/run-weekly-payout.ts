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
 *
 * ⚠️ UNDER THE SCHEDULER'S OWN LOCK (29 Sep 2026). It takes the `weekly-payout`
 * advisory lock every backend's Sunday tick takes (`runJobByHand`), so it can
 * never run beside a scheduled payout. If a backend is running the payout right
 * now, this prints "NOT RUN — another process is running …", writes nothing and
 * exits 2. A run that finishes quickly keeps the lock to the end of the
 * scheduler's minimum hold (under a minute) and says so while it waits.
 */
// FIRST, before the job: importing it pulls in composition-root, which builds the
// pg pool — and without the env loaded it builds from unset credentials and dies
// at the first query with "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must
// be a string", an error naming the auth mechanism rather than the cause.
// generate-weekly-pvs.ts had the identical defect (fixed 31 Jul).
import '@/env.js';
import { MANUAL_RUN_SKIPPED_EXIT_CODE, runJobByHand } from '@/scheduler/manual-run.js';
import { runWeeklyPayout, WEEKLY_PAYOUT_JOB } from '@/scheduler/weekly-payout.job.js';

async function main() {
  const outcome = await runJobByHand(WEEKLY_PAYOUT_JOB, runWeeklyPayout);
  process.exit(outcome.ran ? 0 : MANUAL_RUN_SKIPPED_EXIT_CODE);
}

main().catch((error) => {
  console.error('[run-weekly-payout] FAILED:', error);
  process.exit(1);
});
