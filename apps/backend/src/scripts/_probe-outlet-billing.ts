/**
 * WHO ACTUALLY HOLDS `billing` ON EACH PORTAL — asked of the live table.
 *
 * CLAUDE.md states billing:update is held by NOBODY on the outlet portal, so
 * Confirm Daily is refused for every lane including the Owner. `role_permission`
 * is the authority on that claim, so it is the thing to ask.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const r = await db.execute(sql`
  select po.code as module_portal, r.role_name as role, p.permission_type
  from main.role_permission rp
  join main.role r          on r.id = rp.role_id
  join main.m_permission p  on p.id = rp.permission_id
  join main.m_module m      on m.id = p.module_id
  join main.portal po       on po.id = m.portal_id
  where m.module_key = 'billing'
  order by po.code, r.role_name, p.permission_type
`);
for (const row of (r.rows ?? r) as any[]) {
  console.log(`${row.module_portal}/${row.role} -> billing:${row.permission_type}`);
}
process.exit(0);
