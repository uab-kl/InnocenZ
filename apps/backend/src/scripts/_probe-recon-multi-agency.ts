/**
 * READ ONLY. Which venues does the outlet Today reconciliation card mislead?
 *
 * The card takes the venue's NEWEST collection statement (one agency's bill for
 * one week) and compared it against the venue's wages for that week from
 * EVERY agency. A venue supplied by two agencies therefore reads a "difference"
 * that is only the other agency's wages. This asks the rows:
 *  - per venue, how many agencies have issued/settled statements and how many
 *    have supplied wages (non-staffing statuses excluded, as the report does);
 *  - for each venue's newest statement week, every agency's statement beside
 *    that agency's own wages AND the all-agency wages the card used to read.
 *
 * Every statement runs inside `SET TRANSACTION READ ONLY` and is rolled back.
 * Prints organisation names, short ids and RM figures only.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-recon-multi-agency.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';

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

      console.log('venues — agencies with statements vs agencies with wages:');
      console.table(
        await q(sql`
          with st as (
            select outlet_id, count(distinct agency_id)::int as stmt_agencies,
                   count(*)::int as statements
              from main.collection_invoice
             where status in ('issued', 'settled')
             group by outlet_id
          ), wg as (
            select s.outlet_id, count(distinct sa.agency_id)::int as wage_agencies
              from main.shift_assignment sa
              join main.shift s on s.id = sa.shift_id
             where sa.status not in ('cancelled', 'no_show', 'leave_approved')
             group by s.outlet_id
          )
          select o.name as venue, left(o.id::text, 8) as outlet_id8,
                 coalesce(st.stmt_agencies, 0) as stmt_agencies,
                 coalesce(st.statements, 0) as statements,
                 coalesce(wg.wage_agencies, 0) as wage_agencies
            from main.outlet o
            left join st on st.outlet_id = o.id
            left join wg on wg.outlet_id = o.id
           where st.outlet_id is not null or wg.outlet_id is not null
           order by wage_agencies desc, stmt_agencies desc, venue`),
      );

      console.log(
        '\nnewest statement week per venue — per agency vs all agencies (wages):',
      );
      console.table(
        await q(sql`
          with newest as (
            select outlet_id, max(week_start) as week_start
              from main.collection_invoice
             where status in ('issued', 'settled')
             group by outlet_id
          ), stmts as (
            select ci.outlet_id, ci.agency_id, ci.week_start, ci.week_end, ci.status,
                   ci.amount::numeric as billed
              from main.collection_invoice ci
              join newest n on n.outlet_id = ci.outlet_id and n.week_start = ci.week_start
             where ci.status in ('issued', 'settled')
          ), wages as (
            select s.outlet_id, sa.agency_id, st.week_start,
                   coalesce(sum(sa.pay_amount), 0)::numeric as wages
              from main.shift_assignment sa
              join main.shift s on s.id = sa.shift_id
              join (select distinct outlet_id, week_start, week_end from stmts) st
                on st.outlet_id = s.outlet_id
               and s.shift_date between st.week_start and st.week_end
             where sa.status not in ('cancelled', 'no_show', 'leave_approved')
             group by s.outlet_id, sa.agency_id, st.week_start
          ), all_wages as (
            select outlet_id, week_start, sum(wages) as wages_all
              from wages group by outlet_id, week_start
          )
          select o.name as venue, a.name as agency, st.week_start::text as week,
                 st.status, st.billed::text as billed,
                 coalesce(w.wages, 0)::text as own_agency_wages,
                 coalesce(aw.wages_all, 0)::text as all_agency_wages,
                 (st.billed - coalesce(w.wages, 0))::text as variance_per_agency,
                 (st.billed - coalesce(aw.wages_all, 0))::text as variance_card_today
            from stmts st
            join main.outlet o on o.id = st.outlet_id
            join main.agency a on a.id = st.agency_id
            left join wages w on w.outlet_id = st.outlet_id and w.agency_id = st.agency_id
                             and w.week_start = st.week_start
            left join all_wages aw on aw.outlet_id = st.outlet_id and aw.week_start = st.week_start
           order by venue, agency`),
      );

      console.log(
        '\nnewest statement week per venue — agencies that SUPPLIED wages that week:',
      );
      console.table(
        await q(sql`
          with newest as (
            select ci.outlet_id, max(ci.week_start) as week_start
              from main.collection_invoice ci
             where ci.status in ('issued', 'settled')
             group by ci.outlet_id
          ), wk as (
            select distinct ci.outlet_id, ci.week_start, ci.week_end
              from main.collection_invoice ci
              join newest n on n.outlet_id = ci.outlet_id and n.week_start = ci.week_start
          )
          select o.name as venue, a.name as agency, wk.week_start::text as week,
                 coalesce(sum(sa.pay_amount), 0)::text as wages,
                 exists (select 1 from main.collection_invoice ci
                          where ci.outlet_id = wk.outlet_id and ci.agency_id = sa.agency_id
                            and ci.week_start = wk.week_start
                            and ci.status in ('issued', 'settled')) as has_visible_statement
            from wk
            join main.shift s on s.outlet_id = wk.outlet_id
                             and s.shift_date between wk.week_start and wk.week_end
            join main.shift_assignment sa on sa.shift_id = s.id
            join main.outlet o on o.id = wk.outlet_id
            join main.agency a on a.id = sa.agency_id
           where sa.status not in ('cancelled', 'no_show', 'leave_approved')
           group by o.name, a.name, wk.week_start, wk.outlet_id, sa.agency_id
           order by venue, agency`),
      );

      // Drafts are hidden from an outlet, so a venue with only drafts shows no
      // card today — but it will the moment the agency issues them.
      console.log('\nevery statement, any status — venue x agency x status:');
      console.table(
        await q(sql`
          select o.name as venue, a.name as agency, ci.status, count(*)::int as n,
                 min(ci.week_start)::text as first_week, max(ci.week_start)::text as last_week
            from main.collection_invoice ci
            join main.outlet o on o.id = ci.outlet_id
            join main.agency a on a.id = ci.agency_id
           group by 1, 2, 3 order by 1, 2, 3`),
      );

      console.log(
        '\nmulti-agency venues — wages per agency per week (last 6 weeks with work):',
      );
      console.table(
        await q(sql`
          with multi as (
            select s.outlet_id
              from main.shift_assignment sa join main.shift s on s.id = sa.shift_id
             where sa.status not in ('cancelled', 'no_show', 'leave_approved')
             group by s.outlet_id having count(distinct sa.agency_id) > 1
          )
          select o.name as venue, a.name as agency,
                 date_trunc('week', s.shift_date::timestamp)::date::text as week_mon,
                 count(*)::int as assignments,
                 coalesce(sum(sa.pay_amount), 0)::text as wages
            from main.shift_assignment sa
            join main.shift s on s.id = sa.shift_id
            join multi m on m.outlet_id = s.outlet_id
            join main.outlet o on o.id = s.outlet_id
            join main.agency a on a.id = sa.agency_id
           where sa.status not in ('cancelled', 'no_show', 'leave_approved')
           group by 1, 2, 3 order by 3 desc, 1, 2 limit 12`),
      );
      throw new ReadOnlyDone();
    })
    .catch((e) => {
      if (!(e instanceof ReadOnlyDone)) throw e;
    });

  /*
   * The SHIPPED query, split by agency: `reportCostByPrDay` is a SELECT (it
   * runs on its own connection, outside the read-only transaction above, and
   * writes nothing). Its per-agency wage sums must add back to the venue's
   * total — the split may move rows between agencies, never money.
   */
  const repo = new ShiftAssignmentRepositoryClass();
  const venues = toRows<{ id: string; name: string }>(
    await db.execute(sql`
      select o.id, o.name from main.outlet o
       where exists (select 1 from main.shift s
                       join main.shift_assignment sa on sa.shift_id = s.id
                      where s.outlet_id = o.id)
       order by o.name`),
  );
  console.log(
    '\nreportCostByPrDay — wages per agency (all time) vs venue total:',
  );
  const out: Record<string, unknown>[] = [];
  for (const v of venues) {
    const rows = await repo.reportCostByPrDay({ outletIds: [v.id] });
    const byAgency = new Map<string, number>();
    for (const r of rows)
      byAgency.set(r.agencyId, (byAgency.get(r.agencyId) ?? 0) + r.cost);
    const total = rows.reduce((s, r) => s + r.cost, 0);
    const split = [...byAgency.values()].reduce((s, n) => s + n, 0);
    out.push({
      venue: v.name,
      rows: rows.length,
      agencies: byAgency.size,
      rows_missing_agency: rows.filter((r) => !r.agencyId).length,
      wages_total: total.toFixed(2),
      wages_split_sum: split.toFixed(2),
      per_agency: [...byAgency.entries()]
        .map(([id, n]) => `${id.slice(0, 8)}=${n.toFixed(2)}`)
        .join(' '),
    });
  }
  console.table(out);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 800));
    process.exit(1);
  });
