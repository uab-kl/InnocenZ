/**
 * READ ONLY. Velvet 23's Reports screen read "Net earned by night" bars all
 * RM 0.00 beside "Venue share −RM 5,075.00", and "PR spend 0%" beside RM 5,075
 * of PR spend. Is that the DATA (no floor sales against real wages) or the
 * DISPLAY? This prints, per night, the venue's floor sales (`shift_sale`) beside
 * its wages (`shift_assignment.pay_amount`, non-staffing statuses excluded, as
 * the report does) — the two numbers every figure on that screen is built from.
 *
 * Every statement runs inside `SET TRANSACTION READ ONLY` and is rolled back.
 * Prints the venue name, dates and RM figures only.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-velvet-report-nights.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

class ReadOnlyDone extends Error {}

async function main() {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      const q = async <T>(query: ReturnType<typeof sql>) =>
        toRows<T>(await tx.execute(query));

      console.log('Velvet 23 — nights with sales or wages (newest 20):');
      console.table(
        await q(sql`
          with v as (select id from main.outlet where name = 'Velvet 23'),
          sales as (
            select ss.sold_on as d, sum(ss.total_sales_rm)::numeric as sales, count(*)::int as sale_rows
              from main.shift_sale ss join v on v.id = ss.outlet_id
             group by ss.sold_on
          ), wages as (
            select s.shift_date as d, sum(sa.pay_amount)::numeric as wages, count(*)::int as assignments
              from main.shift_assignment sa
              join main.shift s on s.id = sa.shift_id
              join v on v.id = s.outlet_id
             where sa.status not in ('cancelled', 'no_show', 'leave_approved')
             group by s.shift_date
          )
          select coalesce(sales.d, wages.d)::text as night,
                 coalesce(sales.sales, 0)::text as floor_sales,
                 coalesce(sales.sale_rows, 0) as sale_rows,
                 coalesce(wages.wages, 0)::text as wages,
                 coalesce(wages.assignments, 0) as assignments,
                 (coalesce(sales.sales, 0) - coalesce(wages.wages, 0))::text as net
            from sales full join wages on wages.d = sales.d
           order by night desc limit 20`),
      );

      console.log('\nVelvet 23 — totals:');
      console.table(
        await q(sql`
          with v as (select id from main.outlet where name = 'Velvet 23')
          select (select coalesce(sum(total_sales_rm), 0)::text from main.shift_sale ss join v on v.id = ss.outlet_id) as floor_sales_all_time,
                 (select count(*)::int from main.shift_sale ss join v on v.id = ss.outlet_id) as sale_rows,
                 (select coalesce(sum(sa.pay_amount), 0)::text
                    from main.shift_assignment sa join main.shift s on s.id = sa.shift_id join v on v.id = s.outlet_id
                   where sa.status not in ('cancelled', 'no_show', 'leave_approved')) as wages_all_time,
                 (select count(*)::int
                    from main.payment_voucher_receipt r
                    join main.shift_assignment sa on sa.id = r.shift_assignment_id
                    join main.shift s on s.id = sa.shift_id join v on v.id = s.outlet_id) as receipts`),
      );
      throw new ReadOnlyDone();
    })
    .catch((e) => {
      if (!(e instanceof ReadOnlyDone)) throw e;
    });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 800));
    process.exit(1);
  });
