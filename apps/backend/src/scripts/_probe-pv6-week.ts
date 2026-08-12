/** Read-only: what week is PV-000006, and has it ended? */
import './_probe-env';

import { sql } from 'drizzle-orm';
import { db } from '@/db';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

async function main() {
  const rows = toRows<Record<string, unknown>>(
    await db.execute(sql`
      select pv.voucher_no, pv.status, pv.week_start, pv.week_end,
             pv.pr_signed_at, pv.finance_head_signed_at,
             pv.pr_name as pr
        from main.payment_voucher pv
       where pv.week_start >= '2026-07-26'
       order by pv.week_start desc, pv.voucher_no`),
  );
  const today = toRows<{ d: string }>(
    await db.execute(sql`select (now() at time zone 'Asia/Kuala_Lumpur')::date::text as d`),
  )[0]?.d;
  console.log(`KL today: ${today}\n`);
  for (const r of rows) {
    const end = String(r.week_end ?? '');
    const running = today && end ? today <= end : false;
    console.log(
      `${r.voucher_no}  ${String(r.pr ?? '?').padEnd(8)} ${String(r.status).padEnd(15)} ` +
        `week ${r.week_start} -> ${r.week_end}  ${running ? 'STILL RUNNING' : 'week ended'}` +
        `${r.pr_signed_at ? '  pr-signed' : ''}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
