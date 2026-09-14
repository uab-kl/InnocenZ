/**
 * READ-ONLY. Payroll says "2 paid in History"; History shows 1. Which is right?
 *
 * Two opposite answers: the card is over-counting a voucher that is not this
 * agency's, or History is HIDING one that is. Prints every paid voucher with
 * the agency that owns it and whether its PR is on that agency's roster —
 * which is the test `getAgencyManagedPvs` applies and the card does not.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-paid-pv-scope.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select v.voucher_no,
         a.name        as owning_agency,
         v.pr_name,
         v.pr_ic,
         (v.user_id is not null) as has_user_id,
         exists (
           select 1 from main.agency_pr ap
           where ap.agency_id = v.agency_id and ap.user_id = v.user_id
         ) as pr_on_that_agency_roster
  from main.payment_voucher v
  join main.agency a on a.id = v.agency_id
  where lower(v.status::text) = 'paid'
  order by v.voucher_no
`);
console.table(rows.rows ?? rows);
process.exit(0);
