/**
 * Archive every existing payment voucher's PDF to R2.
 *
 * The sign route archives from now on, but vouchers signed before that code
 * (or before the R2 token worked) have no document in the bucket at all. This
 * renders each one through the SAME buildVoucherPdf() the app uses and files it
 * at the same deterministic key, so the archive matches what a PR downloads.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/backfill-pv-pdfs.ts          (dry run)
 *   npx tsx --tsconfig tsconfig.json src/scripts/backfill-pv-pdfs.ts --apply
 */
import '@/load-env';
import { db } from '@/db';
import { PaymentVoucherRepositoryClass } from '@/features/payment-voucher/payment-voucher.repository';
import { voucherExportLines } from '@/features/payment-voucher/payment-voucher.controller';
import {
  archiveVoucherPdf,
  voucherPdfKey,
} from '@/features/payment-voucher/payment-voucher-archive';
import { r2Configured } from '@/util/r2';
import { primeUserFolders } from '@/util/user-folder';
import { sql } from 'drizzle-orm';

const APPLY = process.argv.includes('--apply');

type VoucherRow = {
  id: string;
  user_id: string | null;
  voucher_no: string | null;
  status: string;
  week_start: string | Date | null;
};

async function main() {
  if (!r2Configured()) {
    console.error('R2 is not configured — set R2_* in .env first. Nothing done.');
    process.exitCode = 1;
    return;
  }
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (nothing uploaded) ===');

  // main.ts primes this at boot; a standalone script must do it itself, or
  // userFolder() falls back to the raw uuid and every key is written to
  // `user/<uuid>/pv/…` instead of `user/pr/<name>-<id8>/pv/…`.
  await primeUserFolders();

  // Straight SQL: the repository has no "every voucher" reader, and inventing
  // one for a one-off backfill would widen its API for no product reason.
  const result = await db.execute<VoucherRow>(
    sql`select id, user_id, voucher_no, status, week_start
          from main.payment_voucher
         order by created_at`,
  );
  // node-postgres returns { rows }, some drivers return the array directly.
  const list: VoucherRow[] = Array.isArray(result)
    ? (result as VoucherRow[])
    : ((result as unknown as { rows: VoucherRow[] }).rows ?? []);
  console.log(`vouchers: ${list.length}\n`);

  const repo = new PaymentVoucherRepositoryClass();
  let done = 0;
  let skipped = 0;

  for (const v of list) {
    const label = `${v.voucher_no ?? '(no number)'} ${v.id.slice(0, 8)} [${v.status}]`;
    if (!v.user_id) {
      // No payee user means no owning folder — user/<id>/ would be malformed.
      console.log(`  SKIP ${label}: voucher has no user_id`);
      skipped += 1;
      continue;
    }
    const bundle = await repo.getExportBundle(v.id);
    if (!bundle) {
      console.log(`  SKIP ${label}: no export bundle (missing agency or PR)`);
      skipped += 1;
      continue;
    }
    const key = voucherPdfKey({
      prUserId: v.user_id,
      voucherId: v.id,
      voucherNo: v.voucher_no,
      weekStart: v.week_start,
    });
    if (!APPLY) {
      console.log(`  would write ${label}\n      -> ${key}`);
      done += 1;
      continue;
    }
    try {
      const written = await archiveVoucherPdf({
        prUserId: v.user_id,
        voucherId: v.id,
        voucherNo: v.voucher_no,
      weekStart: v.week_start,
        document: {
          voucher: bundle.voucher,
          agency: bundle.agency,
          pr: bundle.pr,
          lines: voucherExportLines(bundle),
        },
      });
      console.log(`  wrote ${label}\n      -> ${written}`);
      done += 1;
    } catch (error) {
      // Report and continue: one unrenderable voucher must not stop the rest.
      console.log(`  FAILED ${label}: ${(error as Error).message}`);
      skipped += 1;
    }
  }

  console.log(`\n${APPLY ? 'archived' : 'would archive'}: ${done}   skipped: ${skipped}`);
  if (!APPLY) console.log('re-run with --apply to commit.');
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error('ERR', error);
    process.exit(1);
  });
