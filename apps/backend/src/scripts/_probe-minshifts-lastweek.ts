/**
 * READ-ONLY. Why is a below-minimum-shifts penalty being PROPOSED for a week
 * where the PR looks like they were never given three shifts?
 *
 * Re-derives, per PR on the agency's roster, exactly what
 * `attendanceWindow` + `evaluatePenalties` see for the week, then prints the
 * raw assignment rows behind the numbers. Writes nothing.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-minshifts-lastweek.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

const WEEK_START = process.argv[2] ?? '2026-08-30';
const WEEK_END = process.argv[3] ?? '2026-09-05';

const rows = async (q: unknown) => {
  const r = await db.execute(q as never);
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows ?? [])) as Record<string, unknown>[];
};

async function main() {
  console.log(`\nWEEK ${WEEK_START} .. ${WEEK_END}\n${'='.repeat(60)}`);

  const rules = await rows(sql`
    select a.id as agency_id, a.name as agency_name,
           r.rule_type, r.enabled, r.min_shifts_per_week, r.fine_rm
    from main.agency_penalty_rule r
    join main.agency a on a.id = r.agency_id
    where r.rule_type = 'min_shifts_per_week'
    order by a.name`);
  console.log('\nMIN-SHIFTS RULES');
  for (const r of rules) {
    console.log(`  ${r.agency_name}: enabled=${r.enabled} min=${r.min_shifts_per_week} fine=RM ${r.fine_rm}`);
  }

  for (const rule of rules) {
    if (!rule.enabled || rule.min_shifts_per_week == null) continue;
    const min = Number(rule.min_shifts_per_week);
    const agencyId = String(rule.agency_id);

    const window = await rows(sql`
      with wk as (
        select sa.pr_id, sa.status, sa.cancel_fee_rm, sa.cancel_fee_waived_at
        from main.shift_assignment sa
        join main.shift s on s.id = sa.shift_id
        where sa.agency_id = ${agencyId}
          and s.shift_date between ${WEEK_START} and ${WEEK_END}
      )
      select u.id as pr_id, u.username,
             count(*)::int as assigned,
             count(*) filter (where wk.status = 'leave_approved')::int as excused,
             count(*) filter (where wk.status = 'cancelled'
                              and wk.cancel_fee_rm is not null
                              and wk.cancel_fee_rm > 0
                              and wk.cancel_fee_waived_at is null)::int as paid_cancels,
             count(*) filter (where wk.status = 'completed')::int as completed
      from wk join main."user" u on u.id = wk.pr_id
      group by u.id, u.username
      order by u.username`);

    console.log(`\n${rule.agency_name} — min ${min}/week`);
    if (window.length === 0) console.log('  (no assignments this week)');
    for (const w of window) {
      const assigned = Number(w.assigned);
      const opportunity = assigned - Number(w.excused) - Number(w.paid_cancels);
      const completed = Number(w.completed);
      const guardSkips = opportunity < min;
      const breach = !guardSkips && completed < min;
      console.log(
        `  ${String(w.username).padEnd(28)} assigned=${assigned} excused=${w.excused} paidCancels=${w.paid_cancels} -> opportunity=${opportunity} | completed=${completed}` +
          `  => ${breach ? `BREACH "${completed} of ${min} shifts this week"` : guardSkips ? 'skipped (no opportunity)' : 'compliant'}`,
      );
      if (breach) {
        const detail = await rows(sql`
          select s.shift_date, s.slot, sa.status, sa.check_in_at, sa.cancel_fee_rm, sa.cancel_fee_waived_at,
                 o.name as outlet_name
          from main.shift_assignment sa
          join main.shift s on s.id = sa.shift_id
          left join main.outlet o on o.id = s.outlet_id
          where sa.pr_id = ${String(w.pr_id)} and sa.agency_id = ${agencyId}
            and s.shift_date between ${WEEK_START} and ${WEEK_END}
          order by s.shift_date`);
        for (const d of detail) {
          console.log(
            `        ${String(d.shift_date).slice(0, 10)}  ${String(d.slot ?? '—').padEnd(16)} ${String(d.status).padEnd(16)} ` +
              `fee=${d.cancel_fee_rm ?? '—'} waived=${d.cancel_fee_waived_at ? 'yes' : 'no'}  ${d.outlet_name ?? ''}`,
          );
        }
      }
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
