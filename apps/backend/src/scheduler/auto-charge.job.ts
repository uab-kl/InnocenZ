import { runAutoCharge } from '@/features/subscription-payment/auto-charge.js';
import { logger } from '@/util/logger.js';
import type { JobDefinition } from './scheduler.js';

/**
 * Charges each newly opened bill to the org's saved card or linked e-wallet —
 * see `features/subscription-payment/auto-charge.ts` for the rules.
 *
 * 04:00 KL, DAILY: after the 03:00 invoice job has opened the day's periods and
 * after Sunday's 03:30 tier job, which may add an `upgrade` bill (a dearer tier)
 * or a credit against the next period (a cheaper one) — so the week is charged
 * with everything that job decided. Daily for the same reason the invoice job
 * is: an agency's week and each outlet's month open on different days.
 *
 * Idempotent across processes by design (the claim locks the invoice row), so a
 * second backend process running this at the same minute charges nothing twice.
 * OFF unless `AUTO_CHARGE_ENABLED=true` in this process's environment.
 */
const SCHEDULE = '0 4 * * *';

async function runAutoChargeJob(): Promise<void> {
  const result = await runAutoCharge();
  // Logged even when nothing ran: a silent job is indistinguishable from one
  // that stopped running.
  logger.info(
    `[auto-charge] enabled=${result.enabled} gateway=${result.gateway ?? 'none'} scanned=${result.scanned} ` +
      `charged=${result.charged} succeeded=${result.succeeded} pending=${result.pending} failed=${result.failed} ` +
      `recordErrors=${result.recordErrors} stranded=${result.stranded.length} skipped=${JSON.stringify(result.skipped)}`,
  );
}

export const AUTO_CHARGE_JOB: JobDefinition = {
  name: 'auto-charge',
  schedule: SCHEDULE,
  run: runAutoChargeJob,
};
