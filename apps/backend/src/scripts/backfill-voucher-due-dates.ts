/**
 * Backfills `payment_voucher.due_date` for vouchers that predate the change of
 * 3 Aug 2026, which began computing the due date from the week's END rather than
 * from the issue date.
 *
 * READ-ONLY BY DEFAULT:
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/backfill-voucher-due-dates.ts
 *
 * Writes only when asked explicitly:
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/backfill-voucher-due-dates.ts --apply
 *
 * ⚠️ The `dow = 0` filter is load-bearing, not decoration. A voucher still
 * anchored to Monday would get a due date seven days after the WRONG week end,
 * so this deliberately skips anything not yet Sun-anchored and reports it as
 * outstanding instead of quietly giving it a plausible, wrong date. Re-anchor
 * first (`reanchor-voucher-weeks.ts`), then run this.
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

const APPLY = process.argv.includes('--apply');

const iso = (v: unknown): string => (v === null || v === undefined ? '—' : String(v).slice(0, 10));

type Row = {
  voucher_no: string | null;
  week_start: string | null;
  week_end: string | null;
  due_date: string | null;
  dow: number | string;
};

async function main() {
  console.log(APPLY ? 'MODE: APPLY (will write)' : 'MODE: report only (writes nothing)');

  const missing = await db.execute(sql`
    select voucher_no, week_start, week_end, due_date,
           extract(dow from week_start) as dow
      from main.payment_voucher
     where due_date is null
     order by week_start
  `);

  const rows = missing.rows as unknown as Row[];
  if (rows.length === 0) {
    console.log('\nEvery voucher already has a due date. Nothing to do.');
    process.exit(0);
  }

  const eligible = rows.filter((r) => Number(r.dow) === 0);
  const skipped = rows.filter((r) => Number(r.dow) !== 0);

  for (const r of eligible) {
    const due = new Date(`${iso(r.week_end)}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 7);
    console.log(
      `SET  ${r.voucher_no}: week ${iso(r.week_start)}..${iso(r.week_end)} -> due ${iso(due.toISOString())}`,
    );
  }
  for (const r of skipped) {
    console.log(
      `SKIP ${r.voucher_no}: week_start ${iso(r.week_start)} is not a Sunday (dow ${r.dow}) — ` +
        `re-anchor it first, or its due date would be seven days after the wrong week end`,
    );
  }

  if (eligible.length === 0) {
    console.log('\nNothing eligible. Re-anchor the skipped voucher(s) first.');
    process.exit(0);
  }

  if (!APPLY) {
    console.log(
      `\n${eligible.length} voucher(s) would get a due date, ${skipped.length} skipped. ` +
        `Re-run with --apply to write.`,
    );
    process.exit(0);
  }

  const written = await db.execute(sql`
    update main.payment_voucher
       set due_date   = week_end + 7,
           updated_at = now(),
           updated_by = 'backfill-voucher-due-dates'
     where due_date is null
       and extract(dow from week_start) = 0
    returning voucher_no, due_date
  `);

  for (const w of written.rows as unknown as Row[]) {
    console.log(`WROTE ${w.voucher_no} -> due ${iso(w.due_date)}`);
  }
  console.log(
    `\nDone. ${written.rows.length} voucher(s) backfilled` +
      (skipped.length > 0 ? `, ${skipped.length} still outstanding (not Sun-anchored).` : '.'),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
