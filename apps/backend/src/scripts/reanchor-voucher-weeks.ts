/**
 * Re-anchors existing `payment_voucher` weeks from Mon–Sun to Sun–Sat, after the
 * code change of 3 Aug 2026.
 *
 * READ-ONLY BY DEFAULT. Prints what it would do and changes nothing:
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/reanchor-voucher-weeks.ts
 *
 * Writes only when asked explicitly:
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/reanchor-voucher-weeks.ts --apply
 *
 * The new week is DERIVED — `weekOfDate(old week_start)` gives the Sun–Sat week
 * containing that old Monday — rather than blindly subtracting a day, so a row
 * whose boundary is already right is left alone instead of being shifted into a
 * wrong one, and the script is safe to re-run.
 *
 * ⚠️ The one case that moves MONEY is a line dated on a Sunday: under Mon–Sun it
 * closed the old week, under Sun–Sat it opens the next one, so it belongs to a
 * different voucher. This script will not make that call. It asserts every line
 * still falls inside its voucher's NEW window and REFUSES THE WHOLE RUN if any
 * does not — re-parenting a money line is a separate, deliberate act.
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { weekOfDate } from '@/features/payment-voucher/payment-voucher-week.js';

const APPLY = process.argv.includes('--apply');

type Row = {
  id: string;
  voucher_no: string | null;
  pr_name: string | null;
  status: string;
  week_start: string | null;
  week_end: string | null;
};

const iso = (v: string | Date | null): string | null =>
  v === null ? null : String(v).slice(0, 10);

async function main() {
  console.log(APPLY ? 'MODE: APPLY (will write)' : 'MODE: report only (writes nothing)');

  const vouchers = await db.execute(sql`
    select id, voucher_no, pr_name, status, week_start, week_end
      from main.payment_voucher
     order by week_start desc
  `);

  const planned: { row: Row; weekStart: string; weekEnd: string }[] = [];
  const blocked: string[] = [];

  for (const raw of vouchers.rows as unknown as Row[]) {
    const oldStart = iso(raw.week_start);
    if (!oldStart) {
      console.log(`SKIP ${raw.voucher_no}: no week_start to re-anchor`);
      continue;
    }
    const next = weekOfDate(oldStart);
    if (!next) {
      blocked.push(`${raw.voucher_no}: week_start "${oldStart}" is not a valid date`);
      continue;
    }

    if (next.weekStart === oldStart && next.weekEnd === iso(raw.week_end)) {
      console.log(`OK   ${raw.voucher_no}: already ${oldStart}..${next.weekEnd} (Sun–Sat)`);
      continue;
    }

    // The refusal that protects the money: every line must still sit inside the
    // new seven days. A Sunday-dated line is the only way this fails.
    const lines = await db.execute(sql`
      select line_date, amount from main.payment_voucher_line
       where voucher_id = ${raw.id} and line_date is not null
    `);
    const outside = (lines.rows as unknown as { line_date: string; amount: string }[])
      .map((l) => ({ date: iso(l.line_date)!, amount: l.amount }))
      .filter((l) => l.date < next.weekStart || l.date > next.weekEnd);

    if (outside.length > 0) {
      blocked.push(
        `${raw.voucher_no}: ${outside.length} line(s) fall OUTSIDE the new week ` +
          `${next.weekStart}..${next.weekEnd} — ${outside
            .map((l) => `${l.date} RM ${l.amount}`)
            .join(', ')}. These belong on a different voucher; re-parent them deliberately.`,
      );
      continue;
    }

    planned.push({ row: raw, weekStart: next.weekStart, weekEnd: next.weekEnd });
    console.log(
      `MOVE ${raw.voucher_no} (${raw.pr_name}, ${raw.status}): ` +
        `${oldStart}..${iso(raw.week_end)} -> ${next.weekStart}..${next.weekEnd} ` +
        `· ${lines.rows.length} line(s), all inside`,
    );
  }

  if (blocked.length > 0) {
    console.error('\nREFUSING TO WRITE — these would move money between vouchers:');
    for (const b of blocked) console.error(`  ${b}`);
    process.exit(1);
  }

  if (planned.length === 0) {
    console.log('\nNothing to change.');
    process.exit(0);
  }

  if (!APPLY) {
    console.log(
      `\n${planned.length} voucher(s) would be re-anchored. Re-run with --apply to write.`,
    );
    process.exit(0);
  }

  for (const p of planned) {
    await db.execute(sql`
      update main.payment_voucher
         set week_start = ${p.weekStart}::date,
             week_end   = ${p.weekEnd}::date,
             updated_at = now(),
             updated_by = 'reanchor-voucher-weeks'
       where id = ${p.row.id}
    `);
    console.log(`WROTE ${p.row.voucher_no} -> ${p.weekStart}..${p.weekEnd}`);
  }

  console.log(`\nDone. ${planned.length} voucher(s) re-anchored to Sun–Sat.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
