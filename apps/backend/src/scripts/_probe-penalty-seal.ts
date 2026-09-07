/**
 * DRY RUN by default — evaluates the previous complete week for every agency
 * with penalty rules and reports what WOULD be recorded. Pass `--apply` to
 * actually seal, which is what the Sunday 08:00 job does on its own.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-penalty-seal.ts
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-penalty-seal.ts --apply
 */
import './_probe-env';
import { runPenaltySeal } from '../scheduler/penalty-seal.job';

const apply = process.argv.includes('--apply');

async function main() {
  const r = await runPenaltySeal(new Date(), { dryRun: !apply });
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
