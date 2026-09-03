/** Read-only: why can this voucher not be sent? Walks every gate term in order. */
import './_probe-env';

import { sql } from 'drizzle-orm';
import { db } from '@/db';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

async function main() {
  const today = toRows<{ d: string }>(
    await db.execute(sql`select (now() at time zone 'Asia/Kuala_Lumpur')::date::text as d`),
  )[0]?.d;
  console.log(`KL today: ${today}\n`);

  const vouchers = toRows<Record<string, unknown>>(
    await db.execute(sql`
      select pv.id, pv.voucher_no, pv.status, pv.week_start, pv.week_end,
             pv.pr_id, pv.agency_id, pv.finance_head_signed_at, pv.pr_signed_at,
             pv.pr_name
        from main.payment_voucher pv
       where pv.week_start >= '2026-08-10'
       order by pv.week_start desc, pv.voucher_no`),
  );

  for (const v of vouchers) {
    const id = String(v.id);
    const weekEnd = String(v.week_end ?? '');
    const weekOpen = today && weekEnd ? weekEnd >= today : false;
    console.log(
      `\n=== ${v.voucher_no}  ${String(v.pr_name ?? '?')}  ${v.status}  ` +
        `week ${v.week_start}->${v.week_end}`,
    );
    console.log(`  1. week still open?      ${weekOpen ? 'YES -> BLOCKS' : 'no'}`);
    console.log(
      `  2. finance signed?       ${v.finance_head_signed_at ? `yes (${v.finance_head_signed_at})` : 'NO -> BLOCKS'}`,
    );

    const receipts = toRows<Record<string, unknown>>(
      await db.execute(sql`
        select receipt_no, status from main.payment_voucher_receipt
         where voucher_id = ${id}::uuid order by receipt_no`),
    );
    const pending = receipts.filter((r) => String(r.status) === 'pending');
    console.log(
      `  3. receipts: ${receipts.length} total, ${pending.length} pending` +
        (pending.length ? ` -> BLOCKS: ${pending.map((r) => r.receipt_no).join(', ')}` : ''),
    );
    if (receipts.length)
      console.log(
        `     statuses: ${receipts.map((r) => `${r.receipt_no}=${r.status}`).join(' ')}`,
      );

    if (v.pr_id && v.week_start && v.week_end) {
      const ot = toRows<Record<string, unknown>>(
        await db.execute(sql`
          select sa.id, s.shift_date, sa.overtime_minutes, sa.overtime_status
            from main.shift_assignment sa
            join main.shift s on s.id = sa.shift_id
           where sa.pr_id = ${String(v.pr_id)}::uuid
             and s.shift_date between ${String(v.week_start)} and ${String(v.week_end)}
             and coalesce(sa.overtime_minutes, 0) > 0
           order by s.shift_date`),
      );
      const undecided = ot.filter(
        (r) => r.overtime_status === null || String(r.overtime_status) === 'pending',
      );
      console.log(
        `  4. overtime claims: ${ot.length} with minutes, ${undecided.length} undecided` +
          (undecided.length
            ? ` -> BLOCKS: ${undecided.map((r) => `${r.shift_date}(${r.overtime_minutes}m,${r.overtime_status})`).join(', ')}`
            : ''),
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
