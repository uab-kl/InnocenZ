/**
 * DRY RUN by default — prints exactly which assignments the no-show sweep would
 * mark, and writes nothing. Pass `--apply` to actually run it.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-no-show-sweep.ts
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-no-show-sweep.ts --apply
 */
import './_probe-env';
import { runNoShowSweep } from '../scheduler/no-show-sweep.job';

const apply = process.argv.includes('--apply');

async function main() {
  const result = await runNoShowSweep(new Date(), { dryRun: !apply });
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
