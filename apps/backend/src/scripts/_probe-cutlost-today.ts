/**
 * READ-ONLY. Why is there no "Reduce cut-loss" section on the outlet's Today
 * page for tonight's live shift? The web gate is
 *   shift.status === 'confirmed' && openSlots > 0 && outletCan(subRole,'requestCutLoss')
 * so this asks the DB for the shift's status/staffing AND the operator's lane.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-cutlost-today.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

async function q(label: string, statement: any) {
  const res: any = await db.execute(statement);
  const rows = res.rows ?? res;
  console.log(`\n=== ${label} ===`);
  for (const r of rows) console.log('  ', JSON.stringify(r));
  return rows;
}

async function main() {
  await q(
    "Emhub Testing — today's shift",
    sql`SELECT s.id, s.event_name, s.status, s.slot, s.quantity,
               (SELECT count(*) FROM main.shift_assignment a
                 WHERE a.shift_id = s.id
                   AND a.status NOT IN ('cancelled','no_show','leave_approved')) AS staffed
        FROM main.shift s JOIN main.outlet o ON o.id = s.outlet_id
        WHERE o.name ILIKE '%Emhub%' AND s.shift_date = CURRENT_DATE`,
  );

  await q(
    'Emhub Testing — members and their RBAC role names',
    sql`SELECT u.id AS user_id, u.username, u.email, ou.status AS membership_status,
               r.role_name, r.status AS role_status
        FROM main.outlet o
        JOIN main.outlet_user ou ON ou.outlet_id = o.id
        JOIN main."user" u ON u.id = ou.user_id
        LEFT JOIN main.user_role ur ON ur.user_id = u.id
        LEFT JOIN main.role r ON r.id = ur.role_id
        WHERE o.name ILIKE '%Emhub%'`,
  );

  await q(
    'cutlost requests already raised for this venue',
    sql`SELECT c.id, c.shift_id, c.kind, c.status, c.estimated_savings, c.created_at
        FROM main.cutlost_request c
        JOIN main.shift s ON s.id = c.shift_id
        JOIN main.outlet o ON o.id = s.outlet_id
        WHERE o.name ILIKE '%Emhub%'
        ORDER BY c.created_at DESC LIMIT 10`,
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
