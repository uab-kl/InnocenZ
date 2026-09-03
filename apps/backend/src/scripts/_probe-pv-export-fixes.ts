/** Read-only: render PV-000010's real export and check the 3 document fixes. */
import './_probe-env';

import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { PaymentVoucherRepositoryClass } from '@/features/payment-voucher/payment-voucher.repository';
import { exportLineLabel, loadAgencyLogo } from '@/features/payment-voucher/payment-voucher-excel';
import { buildVoucherPdf } from '@/features/payment-voucher/payment-voucher-pdf';
import { voucherExportLines } from '@/features/payment-voucher/payment-voucher.controller';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

async function main() {
  const [row] = toRows<{ id: string }>(
    await db.execute(sql`select id from main.payment_voucher where voucher_no = 'PV-000010'`),
  );
  const bundle = await new PaymentVoucherRepositoryClass().getExportBundle(row.id);
  if (!bundle) throw new Error('no bundle');

  console.log(`agency: ${bundle.agency?.name}`);
  console.log(`logo key: ${bundle.agency?.logoImage}`);

  const logo = await loadAgencyLogo(bundle.agency);
  console.log(
    logo
      ? `LOGO RESOLVED: ${logo.data.length} bytes, extension=${logo.extension}`
      : 'LOGO: none (renders without)',
  );

  const lines = voucherExportLines(bundle);
  console.log('\nLINE LABELS:');
  for (const l of lines) {
    console.log(`  kind=${String(l.kind).padEnd(7)} component=${String(l.component).padEnd(16)} -> ${exportLineLabel(l)}`);
  }

  const pdf = await buildVoucherPdf({
    voucher: bundle.voucher,
    agency: bundle.agency,
    pr: bundle.pr,
    lines,
  });
  console.log(`\nPDF built: ${pdf.length} bytes`);
  console.log(`voucher issued_date on this row: ${bundle.voucher.issuedDate ?? 'NULL (pre-dates the fix)'}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
