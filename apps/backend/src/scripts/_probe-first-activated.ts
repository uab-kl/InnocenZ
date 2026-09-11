/** Did 0163 record who was ever really a member? READ-ONLY. */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));
async function main() {
  const r = rows(await db.execute(sql`
    select kind, status, count(*)::int as n,
           sum(case when first_activated_at is not null then 1 else 0 end)::int as stamped
      from (
        select 'agency' as kind, status, first_activated_at from main.agency_user
        union all
        select 'outlet', status, first_activated_at from main.outlet_user
      ) x
     group by kind, status order by kind, status`));
  console.log('\n kind   | status   | rows | with a first-activated date');
  for (const x of r) {
    console.log(` ${String(x.kind).padEnd(6)} | ${String(x.status).padEnd(8)} | ${String(x.n).padStart(4)} | ${x.stamped}`);
  }
  console.log('\nExpected: every `active` row stamped; `rejected` never stamped;');
  console.log('`pending` stamped ONLY if they were a member before (a re-join).');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
