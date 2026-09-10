import { readFileSync } from 'node:fs';
import pg from 'pg';
const env = readFileSync('C:/Users/User/Documents/Cursor/InnocenZ/.env', 'utf8');
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const c = new pg.Client({ connectionString: url });
await c.connect();
const { rows } = await c.query(`
  SELECT o.name AS outlet, r.kind, r.tier, r.daily_wage AS wage, r.target_sales_rm AS target,
         r.happy_hour_drink_pct AS hh, r.drink_pct AS nh, r.tip_pct AS tips,
         r.standard_shift_hours AS hrs, r.sort_order
  FROM main.outlet_tier_rate r
  JOIN main.outlet o ON o.id = r.outlet_id
  ORDER BY o.name, r.sort_order`);
let cur = null;
for (const r of rows) {
  if (r.outlet !== cur) { cur = r.outlet; console.log(`\n=== ${cur} ===`); console.log('kind        tier            wage   target    hh    nh  tips  hrs'); }
  console.log(`${String(r.kind).padEnd(11)} ${String(r.tier).padEnd(14)} ${String(r.wage).padStart(6)} ${String(r.target).padStart(8)} ${String(r.hh).padStart(5)} ${String(r.nh).padStart(5)} ${String(r.tips).padStart(5)} ${String(r.hrs).padStart(4)}`);
}
console.log('\ntotal rows:', rows.length);
const noRates = await c.query(`SELECT o.name FROM main.outlet o
  WHERE NOT EXISTS (SELECT 1 FROM main.outlet_tier_rate r WHERE r.outlet_id = o.id) ORDER BY o.name`);
console.log('outlets with NO tier rows:', noRates.rows.map(r => r.name).join(', ') || '(none)');
await c.end();
