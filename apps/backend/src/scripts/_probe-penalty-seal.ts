/**
 * DRY RUN by default — evaluates the previous complete week for every agency
 * with penalty rules and reports what WOULD be recorded. Pass `--apply` to
 * actually seal, which is what the Sunday 08:00 job does on its own.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-penalty-seal.ts
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-penalty-seal.ts --apply
 *
 * `--apply` runs under the scheduler's own `penalty-seal` lock (29 Sep 2026,
 * `runJobByHand`): while a backend's Sunday 08:00 tick is sealing, it prints
 * "NOT RUN — another process is running …", writes nothing and exits 2. The dry
 * run takes no lock — it writes nothing, and holding the lock could make the
 * real tick skip its week.
 */
import './_probe-env';
import { MANUAL_RUN_SKIPPED_EXIT_CODE, runJobByHand } from '../scheduler/manual-run';
import { PENALTY_SEAL_JOB, runPenaltySeal } from '../scheduler/penalty-seal.job';

const apply = process.argv.includes('--apply');

async function main() {
  const outcome = apply
    ? await runJobByHand(PENALTY_SEAL_JOB, () => runPenaltySeal(new Date(), { dryRun: false }))
    : { ran: true as const, result: await runPenaltySeal(new Date(), { dryRun: true }) };
  if (!outcome.ran) process.exit(MANUAL_RUN_SKIPPED_EXIT_CODE);
  const r = outcome.result;
  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN - nothing written'}`);
  console.log(`  week      : ${r.weekStart} .. ${r.weekEnd}`);
  console.log(`  agencies  : ${r.agencies} (with an enabled rule)`);
  console.log(`  evaluated : ${r.evaluated} breach(es)`);
  console.log(`  recorded  : ${r.sealed} new charge(s)`);
  console.log('\nSealing records a debt. It does NOT bill anyone - "Add to voucher" still does.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
