/**
 * WHOSE payment methods exist today, and would a per-person split have an owner
 * to assign each row to?
 *
 * Owner, 12 Sep 2026: "the payment method like the owner save thier own info
 * detials, guarantor saved thier own detials." The table has no `user_id`, so
 * every row is org-wide today. `created_by` is the only record of who saved one.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select
    coalesce(o.name, a.name)                                as org,
    case when pm.outlet_id is not null then 'outlet' else 'agency' end as kind,
    pm.type, pm.brand, pm.last4, pm.status, pm.is_default, pm.auto_pay,
    pm.created_by,
    u.email as created_by_email,
    coalesce(au.sub_role, ou.sub_role)                      as creator_lane
  from main.payment_method pm
  left join main.outlet o  on o.id = pm.outlet_id
  left join main.agency a  on a.id = pm.agency_id
  left join main."user" u  on u.id::text = pm.created_by
  left join main.agency_user au on au.user_id::text = pm.created_by and au.agency_id = pm.agency_id
  left join main.outlet_user ou on ou.user_id::text = pm.created_by and ou.outlet_id = pm.outlet_id
  order by org
`);
const list = (rows.rows ?? rows) as any[];
console.log(`payment_method rows: ${list.length}`);
for (const r of list) {
  console.log(`  ${String(r.org).slice(0,24).padEnd(25)} ${r.kind.padEnd(7)} ${String(r.type).padEnd(6)} ${String(r.brand).padEnd(10)} ****${r.last4 ?? '----'}  default=${r.is_default} autoPay=${r.auto_pay}  savedBy=${r.created_by_email ?? r.created_by} lane=${r.creator_lane ?? '(not a member / system)'}`);
}
const unattributable = list.filter((r) => !r.creator_lane);
console.log(`\n${list.length - unattributable.length} row(s) could be assigned to a person; ${unattributable.length} could NOT (no membership row for created_by).`);
process.exit(0);
