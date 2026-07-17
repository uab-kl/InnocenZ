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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Previous complete Monday–Sunday relative to `ref` (UTC). */
function previousWeek(ref: Date): { weekStart: string; weekEnd: string } {
  const day = ref.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7; // Mon=0
  const thisMonday = new Date(ref);
  thisMonday.setUTCDate(ref.getUTCDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);
  return { weekStart: isoDate(lastMonday), weekEnd: isoDate(lastSunday) };
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const defaults = previousWeek(new Date());
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
