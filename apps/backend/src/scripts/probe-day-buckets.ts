/**
 * READ-ONLY. Every voucher line a PR has on one day, with the bucket the PR app
 * files it under, so a Payment-page column total can be checked against the rows
 * behind it — and the receipts checked for the same paper logged twice.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-day-buckets.ts Vicky 2026-08-04
 *
 * `lineKind()` in payment-voucher.controller.ts decides the bucket: a packed ref
 * (`kind|source|sales|receiptRef|category`) wins, and only a ref with no packed
 * kind falls through to the typed `component` column. Both are printed so the
 * two can be seen disagreeing.
 *
 * Nothing is written. No route, no controller — a hand-run probe, same shape as
 * probe-receipts.ts.
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

const PR_NAME = process.argv[2] ?? 'Vicky';
const DAY = process.argv[3] ?? '2026-08-04';

/** Same precedence as the server's lineKind(): packed ref first, then component. */
function bucketOf(ref: string | null, component: string | null): string {
  const packed = ref?.includes('|') ? ref.split('|')[0] : null;
  if (packed) return packed;
  if (component === 'wages' || component === 'daily_wage') return 'wages';
  if (component === 'drink_commission') return 'drinks';
  if (component === 'tip_commission') return 'tips';
  return `others(${component})`;
}

/** The fold the server uses when it compares order numbers (normaliseOrderNo). */
function foldOrderNo(orderNo: string | null): string {
  if (!orderNo) return '';
  return orderNo
    .trim()
    .replace(/[\s\-_/.]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8');
}

async function main() {
  const lines = await db.execute(sql`
    select l.id, l.line_date, l.description, l.quantity, l.amount, l.component,
           l.ref, l.receipt_id, l.outlet, l.created_at,
           jsonb_array_length(coalesce(l.proof_photos, '[]'::jsonb)) as line_photos,
           r.receipt_no, r.order_no, r.status as receipt_status, r.source as receipt_source,
           r.shift_assignment_id, v.voucher_no, p.name as pr_name
      from main.payment_voucher_line l
      join main.payment_voucher v on v.id = l.voucher_id
      left join main.payment_voucher_receipt r on r.id = l.receipt_id
      left join main.pr p on p.id = v.pr_id
     where p.name ilike ${`%${PR_NAME}%`}
       and l.line_date = ${DAY}
     order by l.created_at
  `);

  console.log(`\n=== ${PR_NAME} · ${DAY} · ${lines.rows.length} line(s) ===\n`);

  const totals = new Map<string, { n: number; commission: number; sales: number }>();
  for (const r of lines.rows as Record<string, unknown>[]) {
    const ref = (r.ref as string) ?? null;
    const bucket = bucketOf(ref, (r.component as string) ?? null);
    const commission = Number(r.amount);
    const sales = ref?.includes('|') ? Number(ref.split('|')[2] || 0) : 0;
    const t = totals.get(bucket) ?? { n: 0, commission: 0, sales: 0 };
    totals.set(bucket, { n: t.n + 1, commission: t.commission + commission, sales: t.sales + sales });
    console.log(
      `${bucket.padEnd(9)} ${String(r.description).slice(0, 20).padEnd(20)} qty=${String(r.quantity).padEnd(3)} ` +
        `comm=${commission.toFixed(2).padStart(9)} sales=${sales.toFixed(2).padStart(9)}  ` +
        `${String(r.component).padEnd(15)} ${r.receipt_no ?? '—'}/${r.order_no ?? '—'}/${r.receipt_status ?? '—'} ` +
        `assign=${String(r.shift_assignment_id ?? '—').slice(0, 8)} photos=${r.line_photos} at=${String(r.created_at).slice(11, 19)}`,
    );
  }

  console.log('\n--- WHAT THE PAYMENT PAGE COLUMN SHOWS ---');
  for (const [bucket, t] of totals) {
    console.log(
      `${bucket.padEnd(9)} ${String(t.n).padStart(3)} line(s)  commission RM ${t.commission.toFixed(2).padStart(10)}  (sales RM ${t.sales.toFixed(2)})`,
    );
  }

  // Same paper logged twice: group the day's receipts on the OCR-folded order
  // number, the same key findReceiptByOrderNo compares on.
  const receipts = await db.execute(sql`
    select r.id, r.receipt_no, r.order_no, r.source, r.status, r.shift_assignment_id,
           r.receipt_date, r.receipt_time, r.created_at,
           (select count(*) from main.payment_voucher_line l where l.receipt_id = r.id) as lines,
           (select coalesce(sum(l.amount), 0) from main.payment_voucher_line l where l.receipt_id = r.id) as total
      from main.payment_voucher_receipt r
      join main.payment_voucher v on v.id = r.voucher_id
      left join main.pr p on p.id = v.pr_id
     where p.name ilike ${`%${PR_NAME}%`}
       and exists (select 1 from main.payment_voucher_line l
                    where l.receipt_id = r.id and l.line_date = ${DAY})
     order by r.created_at
  `);

  console.log(`\n--- RECEIPTS THAT DAY (${receipts.rows.length}) ---`);
  const byKey = new Map<string, Record<string, unknown>[]>();
  for (const r of receipts.rows as Record<string, unknown>[]) {
    console.log(
      `${String(r.receipt_no).padEnd(12)} order=${String(r.order_no ?? '—').padEnd(12)} ${String(r.source).padEnd(8)} ` +
        `${String(r.status).padEnd(9)} lines=${r.lines} total=${r.total} ` +
        `assign=${String(r.shift_assignment_id ?? 'NULL').slice(0, 8)} at=${String(r.created_at).slice(11, 19)}`,
    );
    const key = foldOrderNo((r.order_no as string) ?? null);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }

  console.log('\n--- SAME ORDER NUMBER LOGGED MORE THAN ONCE ---');
  let dupes = 0;
  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue;
    dupes++;
    const assigns = new Set(rows.map((r) => String(r.shift_assignment_id ?? 'NULL')));
    console.log(
      `  ${key}: ${rows.map((r) => r.receipt_no).join(', ')} — ${assigns.size} distinct shift stamp(s): ${[...assigns].map((a) => a.slice(0, 8)).join(', ')}`,
    );
  }
  if (dupes === 0) console.log('  none');

  const noOrder = (receipts.rows as Record<string, unknown>[]).filter((r) => !r.order_no);
  console.log(
    `\n  receipts with NO order number (the duplicate guard cannot fire on these): ${noOrder.length}`,
  );

  const rates = await db.execute(sql`
    select o.name as outlet, t.tier, t.kind, t.daily_wage, t.drink_pct,
           t.happy_hour_drink_pct, t.tip_pct, t.standard_shift_hours
      from main.outlet_tier_rate t
      left join main.outlet o on o.id = t.outlet_id
     order by o.name, t.sort_order
  `);
  console.log('\n--- RATE CARD (outlet_tier_rate) ---');
  for (const r of rates.rows) console.log(JSON.stringify(r));

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
