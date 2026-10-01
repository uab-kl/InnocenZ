/**
 * DRY RUN by default — prints exactly which assignments the no-show sweep would
 * mark, and writes nothing. Pass `--apply` to actually run it.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-no-show-sweep.ts
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-no-show-sweep.ts --apply
 *
 * `--apply` runs under the scheduler's own `no-show-sweep` lock (29 Sep 2026,
 * `runJobByHand`): while a backend's 15-minute tick is sweeping, it prints
 * "NOT RUN — another process is running …", writes nothing and exits 2. The dry
 * run takes no lock — it writes nothing, and holding the lock could make a real
 * tick skip its turn.
 */
import './_probe-env';
import { MANUAL_RUN_SKIPPED_EXIT_CODE, runJobByHand } from '../scheduler/manual-run';
import { NO_SHOW_SWEEP_JOB, runNoShowSweep } from '../scheduler/no-show-sweep.job';

const apply = process.argv.includes('--apply');

async function main() {
  const outcome = apply
    ? await runJobByHand(NO_SHOW_SWEEP_JOB, () => runNoShowSweep(new Date(), { dryRun: false }))
    : { ran: true as const, result: await runNoShowSweep(new Date(), { dryRun: true }) };
  if (!outcome.ran) process.exit(MANUAL_RUN_SKIPPED_EXIT_CODE);
  const result = outcome.result;
  const rows = result.rows;
  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN — nothing written'}`);
  console.log(`  would mark : ${rows.length}`);
  console.log(`  swept      : ${result.swept}`);
  console.log(`  skipped    : ${result.skippedNoWindow} (slot carries no clock)`);
  console.log(`  too old    : ${result.tooOld} (beyond the lookback, left alone)`);
  for (const r of rows) {
    console.log(`    ${r.shiftDate.slice(0, 10)}  ${String(r.slot ?? '—').padEnd(16)} pr=${r.prId}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
