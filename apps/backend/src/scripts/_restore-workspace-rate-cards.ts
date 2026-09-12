/**
 * RESTORE the two rate cards a permission probe destroyed (12 Sep 2026).
 *
 * WHAT HAPPENED. `_probe-workspace-lane.ts` sent
 * `{"__probe":"invalid on purpose"}` to `PUT /outlet-workspace/:outletId`,
 * expecting validation to reject it so that only the GATE was tested. The
 * controller treats every field as optional and performs a FULL-DRAFT save, so
 * the body was accepted as "save a workspace with nothing in it":
 *
 *   UAB Emhub  — every scalar zeroed, all 7 outlet_tier_rate rows deleted
 *   Velvet 23  — every scalar zeroed, all 7 outlet_tier_rate rows deleted
 *
 * That is the August lesson repeated: a permission must be probed with a READ,
 * or with a body that CANNOT be valid — never with one the handler might accept.
 *
 * WHY NOT `backfill-default-rate-cards.ts`. That script delegates to
 * `createDefaultRateCard`, which returns 0 for any venue that already has a
 * workspace PARENT row — and both damaged venues still have theirs, zeroed. Its
 * own docstring forbids growing "should I overwrite?" logic, so the repair
 * belongs here instead of bending the backfill.
 *
 * WHERE THE VALUES COME FROM. `default-rate-card.ts` records that its card IS
 * UAB Emhub's own numbers, standardised as the product default on 10 Sep 2026,
 * and the six venues this probe never touched all still carry exactly it
 * (500 / 10% / 15% / 6h / 21:00-23:00, seven tier rows). So Emhub is restored
 * to its own values, and Velvet 23 to the same card its peers hold.
 *
 * ⚠️ VELVET 23 CANNOT BE PROVEN. Its workspace row predates the 10 Sep
 * standardisation (created 22 Jul) and the audit row for the destroying write
 * stored `old_data: null`, so if Velvet had priced its own tiers those numbers
 * are gone and must be re-entered by hand. Emhub is exact; Velvet is best-known.
 *
 * ⚠️ DRINK MENUS ARE NOT RESTORED. `outlet_drink_menu` cascades from the
 * workspace and both venues now show zero rows — but so do four venues this
 * probe never touched, so there is no evidence either had one. Inventing a
 * price list is worse than leaving it empty.
 *
 * Idempotent: scalars are set every run; tier rows are inserted only when the
 * venue has none, so re-running can never duplicate rows or revert real edits.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_restore-workspace-rate-cards.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});

const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const NAMES = ['UAB Emhub', 'Velvet 23'];
const ACTOR = 'restore-after-probe-2026-09-12';

// Copied from default-rate-card.ts — tier, daily wage, target sales,
// HH drink %, NH drink %, tip %.
const TIER_RATES: Array<[string, number, number, number, number, number]> = [
  ['Tier I', 500, 1000, 5, 10, 15],
  ['Tier II', 600, 1200, 6, 11, 16],
  ['Tier III', 700, 1500, 7, 12, 17],
  ['Tier IV', 825, 1800, 8, 13, 18],
  ['Tier V', 1000, 2000, 9, 14, 19],
  ['Servant', 200, 800, 3, 8, 12],
];
const SHIFT_HOURS = 6;
const COMMISSION_ONLY = { hh: 75, drink: 80, tip: 85 };

for (const name of NAMES) {
  const ws = (
    (
      await db.execute(sql`
        select w.id, w.outlet_id
        from main.outlet_workspace w
        join main.outlet o on o.id = w.outlet_id
        where o.name = ${name}
      `)
    ).rows as Array<{ id: string; outlet_id: string }>
  )[0];

  if (!ws) {
    console.log(`SKIP ${name}: no workspace row to restore`);
    continue;
  }

  await db.execute(sql`
    update main.outlet_workspace set
      base_pay_per_hour = '500',
      drink_pct         = '10',
      tip_pct           = '15',
      ot_after_hours    = ${String(SHIFT_HOURS)},
      per_drink_rm      = '0',
      happy_hour_start  = '21:00',
      happy_hour_end    = '23:00',
      updated_at        = now(),
      updated_by        = ${ACTOR}
    where id = ${ws.id}
  `);

  const have = (
    (
      await db.execute(sql`
        select count(*)::int as n from main.outlet_tier_rate where workspace_id = ${ws.id}
      `)
    ).rows as Array<{ n: number }>
  )[0].n;

  if (have === 0) {
    let i = 0;
    for (const [tier, wage, target, hh, drink, tip] of TIER_RATES) {
      // ⚠️ COLUMN NAMES, NOT THE TS PROPERTY NAMES. `default-rate-card.ts` warns
      // about this exact pair and the first run of this script got it wrong: the
      // model's `wagePerHour` is the column `daily_wage` (it is a DAILY wage),
      // and `otAfterHours` is `standard_shift_hours` (a shift LENGTH). Both TS
      // names are wire-compatibility relics; raw SQL must use the real columns.
      await db.execute(sql`
        insert into main.outlet_tier_rate
          (workspace_id, outlet_id, kind, tier, daily_wage, target_sales_rm,
           happy_hour_drink_pct, drink_pct, tip_pct, standard_shift_hours, sort_order,
           created_by, updated_by)
        values
          (${ws.id}, ${ws.outlet_id}, 'tier', ${tier}, ${String(wage)}, ${String(target)},
           ${String(hh)}, ${String(drink)}, ${String(tip)}, ${String(SHIFT_HOURS)}, ${i},
           ${ACTOR}, ${ACTOR})
      `);
      i++;
    }
    // The one commission-only row: no wage, no shift length, much higher rates.
    await db.execute(sql`
      insert into main.outlet_tier_rate
        (workspace_id, outlet_id, kind, tier, daily_wage, target_sales_rm,
         happy_hour_drink_pct, drink_pct, tip_pct, standard_shift_hours, sort_order,
         created_by, updated_by)
      values
        (${ws.id}, ${ws.outlet_id}, 'commission_only', null, null, null,
         ${String(COMMISSION_ONLY.hh)}, ${String(COMMISSION_ONLY.drink)},
         ${String(COMMISSION_ONLY.tip)}, null, ${TIER_RATES.length}, ${ACTOR}, ${ACTOR})
    `);
    console.log(`RESTORED ${name}: scalars + ${TIER_RATES.length + 1} tier rows`);
  } else {
    console.log(`RESTORED ${name}: scalars only (${have} tier rows already present)`);
  }
}

console.log('\nVerify in the portal: Workspace should read RM 500 base, 10% drinks, 15% tips,');
console.log('OT after 6h, happy hour 21:00-23:00, and seven tier rows.');
process.exit(0);
