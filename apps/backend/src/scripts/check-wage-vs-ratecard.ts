// ⚠️ SCHEMA NOTE (12 Sep 2026): `main.pr` was DROPPED (0095) and
// `main.agency_member` renamed (0033). A PR is a `user` row; the membership
// and its tier live on `agency_pr`, and ops columns named `pr_id` equal
// `user_id` after the remap. These queries were left pointing at the old
// relations and threw on their first statement.
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

  // `agency_pr.tier` is the enum `tier_1..tier_5`/`servant`; `outlet_tier_rate.tier`
  // holds the DISPLAY label ("Tier I"). They never join raw — the app bridges
  // them with PR_TIER_TO_OUTLET_LABEL in shift-assignment.controller.ts, and this
  // check has to use the SAME bridge or it reports a fault that does not exist.
  //
  // PR identity comes from `user` + `user_profile` + `agency_pr`. `main.pr` was
  // DROPPED in 0095 and this script still joined it, so it errored out instead of
  // reporting anything — and a check that cannot run is not a check that passes.
  const result = await db.execute(sql`
    WITH tier_map(enum_value, label) AS (
      VALUES ('tier_1','Tier I'), ('tier_2','Tier II'), ('tier_3','Tier III'),
             ('tier_4','Tier IV'), ('tier_5','Tier V'), ('servant','Servant')
    )
    SELECT
      s.shift_date          AS shift_date,
      sa.pay_amount         AS sealed_pay,
      sa.day_rate_amount    AS sealed_day_rate,
      sa.pay_rule           AS pay_rule,
      sa.worked_minutes     AS worked_minutes,
      sa.scheduled_minutes  AS scheduled_minutes,
      COALESCE(NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u(select username from main."user" where id = p.user_id) as full_name), ''), 'PR') AS pr_name,
      ap.tier               AS pr_tier,
      o.name                AS outlet_name,
      -- Same precedence the app resolves in: the per-shift override wins over
      -- the outlet's workspace default. Comparing against only one of the two
      -- would report a false fault every time a shift carries its own rate.
      COALESCE(spt.daily_wage, otr.daily_wage) AS card_daily_wage,
      CASE WHEN spt.daily_wage IS NOT NULL THEN 'shift' ELSE 'outlet' END AS card_source
    FROM main.shift_assignment sa
    LEFT JOIN main."user"       u  ON u.id       = COALESCE(sa.user_id, sa.pr_id)
    LEFT JOIN main.user_profile up ON up.user_id = COALESCE(sa.user_id, sa.pr_id)
    LEFT JOIN main.agency_pr    ap ON ap.user_id = COALESCE(sa.user_id, sa.pr_id)
                                  AND ap.agency_id = sa.agency_id
    LEFT JOIN tier_map     tm ON tm.enum_value = ap.tier::text
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

    // Since 0097 the sealed amount is what the shift EARNED, so comparing it
    // straight to the day rate would report every pro-rated shift as a fault —
    // this check would have turned into a false-alarm generator the day the
    // wage rule shipped. The rate card is still the thing under test: what must
    // agree is the card against `day_rate_amount`, and then the pro-rata
    // arithmetic against the minutes the row itself recorded.
    const worked = Number(row.worked_minutes);
    const scheduled = Number(row.scheduled_minutes);
    const proRated =
      row.pay_rule === 'pro_rata' && Number.isFinite(worked) && scheduled > 0;
    // Rows sealed before 0097 carry no day rate; there the sealed amount IS the
    // rate, exactly as this check always assumed.
    const dayRate =
      row.sealed_day_rate === null || row.sealed_day_rate === undefined
        ? sealed
        : Number(row.sealed_day_rate);
    const expected = proRated
      ? Math.round((dayRate * worked * 100) / scheduled) / 100
      : dayRate;
    const detail = proRated ? `  (pro-rata ${worked}/${scheduled} min)` : '';

    if (Math.abs(dayRate - card) < TOLERANCE && Math.abs(sealed - expected) < TOLERANCE) {
      agree++;
      console.log(`OK  ${label}`);
      console.log(
        `      day rate ${dayRate.toFixed(2)} = card ${card.toFixed(2)} · sealed ${sealed.toFixed(2)}${detail}`,
      );
    } else {
      differ++;
      console.log(`XX  ${label}`);
      console.log(
        `      day rate ${dayRate.toFixed(2)} vs card ${card.toFixed(2)} · ` +
          `sealed ${sealed.toFixed(2)} vs expected ${expected.toFixed(2)}${detail}   <-- DISAGREES`,
      );
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
