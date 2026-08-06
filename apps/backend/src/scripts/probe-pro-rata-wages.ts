/**
 * READ-ONLY. What the pro-rata wage rule (0097) would have sealed on every
 * completed assignment already in the database, against what is sealed today.
 *
 * The rule ships on the check-out path, so it applies only to shifts closed from
 * now on — nothing historic is restated. That leaves an obvious question
 * unanswered: is the rule right, and how much was the flat seal overpaying? This
 * answers both against real stamps, by calling the SAME `earnedWage` and
 * `shiftWindowInstants` the seal calls. Re-implementing the formula here would
 * only prove that two copies of it agree.
 *
 * It writes NOTHING — SELECTs only, safe against the shared database.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-pro-rata-wages.ts
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-pro-rata-wages.ts --since=2026-07-01
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { earnedWage, describeWorkedTime } from '@/features/shift-assignment/wage';
import { shiftWindowInstants } from '@/util/slot-window';

function sinceArg(): string {
  const raw = process.argv.find((a) => a.startsWith('--since='));
  const value = raw?.slice('--since='.length);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '2026-07-01';
}

async function main() {
  const since = sinceArg();

  const result = await db.execute(sql`
    SELECT
      sa.id                AS id,
      sa.pay_amount        AS pay_amount,
      sa.day_rate_amount   AS day_rate_amount,
      sa.pay_rule          AS pay_rule,
      sa.check_in_at       AS check_in_at,
      sa.check_out_at      AS check_out_at,
      s.shift_date         AS shift_date,
      s.slot               AS slot,
      o.name               AS outlet_name
    FROM main.shift_assignment sa
    LEFT JOIN main.shift  s ON s.id = sa.shift_id
    LEFT JOIN main.outlet o ON o.id = s.outlet_id
    WHERE sa.status = 'completed'
      AND s.shift_date >= ${since}
    ORDER BY s.shift_date
  `);

  const rows = ((result as unknown as { rows?: unknown[] }).rows ??
    (result as unknown as unknown[])) as Record<string, unknown>[];

  console.log(`\n${rows.length} completed assignment(s) on or after ${since}\n`);

  let unchanged = 0;
  let reduced = 0;
  let unstamped = 0;
  let overpaidCents = 0;

  for (const row of rows) {
    const label =
      `${String(row.shift_date)}  ${String(row.outlet_name ?? '(no outlet)')}  ` +
      `${String(row.slot ?? '(no slot)')}  ${String(row.id).slice(0, 8)}`;

    // No stamps means the row was never closed by a real check-out, so the rule
    // would never have run on it. Reported, never scored — counting it as
    // "unchanged" would pad the agreement rate with rows nothing was asked of.
    if (!row.check_in_at || !row.check_out_at) {
      unstamped++;
      console.log(`--  ${label}`);
      console.log(`      sealed ${String(row.pay_amount)} · no attendance stamps, rule never applies`);
      continue;
    }

    const sealed = String(row.pay_amount);
    // On rows predating 0097 the flat seal IS the day rate.
    const dayRate = row.day_rate_amount == null ? sealed : String(row.day_rate_amount);
    const scheduled = shiftWindowInstants(String(row.shift_date), row.slot as string | null);
    const wage = earnedWage({
      dayRate,
      scheduled,
      checkInAt: new Date(row.check_in_at as string),
      checkOutAt: new Date(row.check_out_at as string),
    });

    // Printed in the VENUE's clock, always. A pro-rata figure is unreadable
    // without the stamps beside it, and a zero is indistinguishable from a
    // timezone fault unless you can see the window and the stamps in one line.
    const kl = (d: Date) =>
      d.toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour12: false });
    const stamps =
      `in ${kl(new Date(row.check_in_at as string))} · out ${kl(new Date(row.check_out_at as string))}` +
      (scheduled ? ` · window ${kl(scheduled.start)} .. ${kl(scheduled.end)}` : ' · NO window');

    const delta = Math.round((Number(dayRate) - Number(wage.amount ?? dayRate)) * 100);
    const worked =
      wage.workedMinutes != null && wage.scheduledMinutes != null
        ? `  (${describeWorkedTime(wage.workedMinutes, wage.scheduledMinutes)})`
        : '';

    if (delta <= 0) {
      unchanged++;
      console.log(`OK  ${label}`);
      console.log(`      day rate ${dayRate} · rule=${wage.rule}${worked} -> ${wage.amount}\n      ${stamps}`);
    } else {
      reduced++;
      overpaidCents += delta;
      console.log(`!!  ${label}`);
      console.log(
        `      day rate ${dayRate} · rule=${wage.rule}${worked} -> ${wage.amount}\n      ${stamps}` +
          `   OVERPAID by ${(delta / 100).toFixed(2)}`,
      );
    }
  }

  console.log(
    `\n---\nfull day ${unchanged} · would be reduced ${reduced} · unstamped ${unstamped}` +
      `\ntotal overpayment on these rows: RM ${(overpaidCents / 100).toFixed(2)}`,
  );

  // A probe that scored nothing proves nothing, and must never read as a pass.
  if (unchanged === 0 && reduced === 0) {
    console.log('SKIP — no stamped completed assignment in range, so this proves NOTHING.');
  }

  process.exit(0);
}

void main();
