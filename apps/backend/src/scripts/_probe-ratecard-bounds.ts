/**
 * READ-ONLY. Would the new 0-100 / non-negative bounds refuse anything ALREADY
 * STORED?
 *
 * The outlet Workspace screen loads the card and saves it back whole, so a value
 * outside the new bounds would turn every future Save at that venue into a 400.
 * That is the one way this change can break a working screen, so it is checked
 * before shipping rather than after.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const tiers = await db.execute(sql`
  select count(*) as rows,
    count(*) filter (where drink_pct < 0 or drink_pct > 100)                     as bad_drink_pct,
    count(*) filter (where happy_hour_drink_pct < 0 or happy_hour_drink_pct > 100) as bad_hh_pct,
    count(*) filter (where tip_pct < 0 or tip_pct > 100)                         as bad_tip_pct,
    count(*) filter (where daily_wage < 0)                                       as negative_wage,
    count(*) filter (where standard_shift_hours < 0)                             as negative_ot_hours,
    count(*) filter (where target_sales_rm < 0)                                  as negative_target
  from main.outlet_tier_rate
`);
console.log('outlet_tier_rate:', JSON.stringify(tiers.rows ?? tiers, null, 2));

const shiftTiers = await db.execute(sql`
  select count(*) as rows,
    count(*) filter (where drink_pct < 0 or drink_pct > 100)                     as bad_drink_pct,
    count(*) filter (where happy_hour_drink_pct < 0 or happy_hour_drink_pct > 100) as bad_hh_pct,
    count(*) filter (where tip_pct < 0 or tip_pct > 100)                         as bad_tip_pct,
    count(*) filter (where daily_wage < 0)                                       as negative_wage
  from main.shift_pay_tier
`);
console.log('shift_pay_tier (not written by this endpoint, listed for scale):',
  JSON.stringify(shiftTiers.rows ?? shiftTiers, null, 2));

const ws = await db.execute(sql`
  select count(*) as rows,
    count(*) filter (where drink_pct < 0 or drink_pct > 100)  as bad_drink_pct,
    count(*) filter (where tip_pct < 0 or tip_pct > 100)      as bad_tip_pct,
    count(*) filter (where happy_hour_drink_discount_pct < 0
                        or happy_hour_drink_discount_pct > 100) as bad_discount,
    count(*) filter (where base_pay_per_hour < 0)             as negative_base,
    count(*) filter (where per_drink_rm < 0)                  as negative_per_drink,
    count(*) filter (where ot_after_hours < 0)                as negative_ot
  from main.outlet_workspace
`);
console.log('outlet_workspace:', JSON.stringify(ws.rows ?? ws, null, 2));

const menu = await db.execute(sql`
  select count(*) as rows, count(*) filter (where price_rm < 0) as negative_price
  from main.outlet_drink_menu
`);
console.log('outlet_drink_menu:', JSON.stringify(menu.rows ?? menu, null, 2));
process.exit(0);
