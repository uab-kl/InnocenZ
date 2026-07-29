/**
 * Manual trigger for the weekly payment-voucher generation job.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/generate-weekly-pvs.ts
 *   ... --week-start=2026-07-13 --week-end=2026-07-19   # explicit window
 *   ... --agency=<uuid>                                  # one agency only
 *
 * With no --week-start, it defaults to the most recently finished Mon–Sun week.
 * A scheduled cron would call the same PaymentVoucherGenerator.generateForWeek.
 */
import { paymentVoucherGenerator } from '@/composition-root.js';
// Shared with the scheduled job on purpose: this script used to compute the week
// from UTC calendar fields, which lands on the wrong seven days when run near a
// week boundary from Malaysia. One implementation, one answer.
import { previousCompleteWeek } from '@/features/payment-voucher/payment-voucher-week.js';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const defaults = previousCompleteWeek();
  const weekStart = getArg('week-start') ?? defaults.weekStart;
  const weekEnd = getArg('week-end') ?? defaults.weekEnd;
  const agencyId = getArg('agency');

  console.log(`[generate-weekly-pvs] window ${weekStart}..${weekEnd}${agencyId ? ` agency=${agencyId}` : ' (all agencies)'}`);

  const result = await paymentVoucherGenerator.generateForWeek({ weekStart, weekEnd, agencyId });

  console.log(`agencies processed: ${result.agenciesProcessed}`);
  console.log(`vouchers created:   ${result.created.length}`);
  console.log(`skipped:            ${result.skipped.length}`);
  for (const c of result.created) console.log(`  + PR ${c.prId} -> voucher ${c.voucherId} (net ${c.net})`);
  for (const s of result.skipped) console.log(`  - PR ${s.prId} skipped (${s.reason})`);

  process.exit(0);
}

main().catch((error) => {
  console.error('[generate-weekly-pvs] FAILED:', error);
  process.exit(1);
});
