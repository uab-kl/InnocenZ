/**
 * READ-ONLY. Does any role actually hold grants for a module belonging to a
 * DIFFERENT portal than the role itself?
 *
 * The admin RBAC "Manage role" sheet posts only the ids of the portal it is
 * showing, into an endpoint that REPLACES a role's whole permission set — so
 * any cross-portal grant would be silently deleted on the next save. Whether
 * that matters is a question about the live data, not about the code.
 *
 * ⚠️ A zero result here means the live table has none TODAY. It is not proof
 * the save is safe — it is proof there is nothing to lose right now.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select r.role_name, count(*) as n
  from main.role_permission rp
  join main.role r        on r.id  = rp.role_id
  join main.m_permission p on p.id = rp.permission_id
  join main.m_module     m on m.id = p.module_id
  where r.portal_id is not null
    and m.portal_id is not null
    and r.portal_id <> m.portal_id
  group by r.role_name
  order by r.role_name`);

const list = (rows.rows ?? rows) as any[];
console.log('\n=== roles holding a grant from ANOTHER portal ===');
if (list.length === 0) {
  console.log('  none - so a Manage-role save deletes nothing today.');
  console.log('  (A zero result is about the DATA as it stands, not proof the save is safe.)');
} else {
  list.forEach((r) =>
    console.log(`  ${r.role_name}: ${r.n} cross-portal grant(s) would be DELETED on the next save`),
  );
}
process.exit(0);
