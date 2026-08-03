/**
 * READ-ONLY. Closes the one link `payment-voucher-audit.ts` deliberately does
 * not check, and which §9 P1 still lists open as "Verify Payment Voucher <-> PR
 * wage calc".
 *
 * The audit matches a wages line against `shift_assignment.pay_amount` — the
 * amount check-out SEALED. It never asks whether that sealed amount was itself
 * derived correctly from the outlet's rate card. So a wrong rate card produces a
 * voucher that reconciles perfectly and still pays the wrong money: the audit's
 * "OK" is voucher <-> assignment, one link short of the money being right.
 *
 * This prints both sides of that missing link. It writes NOTHING — SELECTs only,
 * so it is safe to re-run against the shared database at any time.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/check-wage-vs-ratecard.ts
 *   npx tsx --tsconfig tsconfig.json src/scripts/check-wage-vs-ratecard.ts --since=2026-07-01
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

/** Cents tolerance, so a numeric/float round-trip is not reported as a fault. */
const TOLERANCE = 0.005;

function sinceArg(): string {
  const raw = process.argv.find((a) => a.startsWith('--since='));
  const value = raw?.slice('--since='.length);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '2026-07-20';
}

async function main() {
  const since = sinceArg();

  // `pr.tier` is the enum `tier_1..tier_4`; `outlet_tier_rate.tier` holds the
  // DISPLAY label ("Tier I"). They never join raw — the app bridges them with
  // PR_TIER_TO_OUTLET_LABEL in shift-assignment.controller.ts, and this check
  // has to use the SAME bridge or it reports a fault that does not exist.
  const result = await db.execute(sql`
    WITH tier_map(enum_value, label) AS (
      VALUES ('tier_1','Tier I'), ('tier_2','Tier II'),
             ('tier_3','Tier III'), ('tier_4','Tier IV')
    )
    SELECT
      s.shift_date   AS shift_date,
      sa.pay_amount  AS sealed_pay,
      pr.name        AS pr_name,
      pr.tier        AS pr_tier,
      o.name         AS outlet_name,
      -- Same precedence the app resolves in: the per-shift override wins over
      -- the outlet's workspace default. Comparing against only one of the two
      -- would report a false fault every time a shift carries its own rate.
      COALESCE(spt.daily_wage, otr.daily_wage) AS card_daily_wage,
      CASE WHEN spt.daily_wage IS NOT NULL THEN 'shift' ELSE 'outlet' END AS card_source
    FROM main.shift_assignment sa
    JOIN main.pr           pr ON pr.id = sa.pr_id
    LEFT JOIN tier_map     tm ON tm.enum_value = pr.tier::text
    LEFT JOIN main.shift    s ON s.id  = sa.shift_id
    LEFT JOIN main.outlet   o ON o.id  = s.outlet_id
    LEFT JOIN main.shift_pay_tier spt
           ON spt.shift_id = s.id  AND spt.tier = tm.label AND spt.kind = 'tier'
    LEFT JOIN main.outlet_tier_rate otr
           ON otr.outlet_id = s.outlet_id AND otr.tier = tm.label AND otr.kind = 'tier'
    WHERE sa.status = 'completed'
      AND s.shift_date >= ${since}
    ORDER BY s.shift_date
  `);

  const rows = ((result as unknown as { rows?: unknown[] }).rows ??
    (result as unknown as unknown[])) as Record<string, unknown>[];

  console.log(`\n${rows.length} completed assignment(s) on or after ${since}\n`);

  let agree = 0;
  let differ = 0;
  let noCard = 0;

  for (const row of rows) {
    const sealed = Number(row.sealed_pay);
    const card =
      row.card_daily_wage === null || row.card_daily_wage === undefined
        ? null
        : Number(row.card_daily_wage);
    const label =
      `${String(row.shift_date)}  ${String(row.pr_name)} @ ` +
      `${String(row.outlet_name ?? '(no outlet)')}  tier=${String(row.pr_tier ?? '-')}` +
      `  [card from ${String(row.card_source ?? '-')}]`;

    if (card === null) {
      noCard++;
      console.log(`?   ${label}`);
      console.log(`      sealed ${sealed.toFixed(2)} · NO rate-card row for this outlet+tier`);
      continue;
    }
    if (Math.abs(sealed - card) < TOLERANCE) {
      agree++;
      console.log(`OK  ${label}`);
      console.log(`      sealed ${sealed.toFixed(2)} = card ${card.toFixed(2)}`);
    } else {
      differ++;
      console.log(`XX  ${label}`);
      console.log(`      sealed ${sealed.toFixed(2)} != card ${card.toFixed(2)}   <-- DISAGREES`);
    }
  }

  console.log(`\n---\nagree ${agree} · disagree ${differ} · no rate-card row ${noCard}`);

  // A check that passed over zero rows proves nothing, and must never be
  // reported as a pass — that is how a green signal starts lying.
  if (agree === 0 && differ === 0) {
    console.log('SKIP — this check saw no comparable rows, so it proves NOTHING.');
  } else if (differ === 0 && noCard === 0) {
    console.log('All sealed pay agrees with the rate card.');
  }

  process.exit(0);
}

void main();
