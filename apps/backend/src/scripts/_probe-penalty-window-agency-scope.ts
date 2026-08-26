/**
 * READ-ONLY. Proves the penalty window was cross-agency, and that scoping it
 * changes a real number on real rows.
 *
 * `attendanceWindow` fed every weekly penalty rule and carried no `agency_id`
 * term, while both its callers were already agency-scoped when choosing WHICH
 * PRs to judge. So the right people were measured against a window covering
 * every agency they work for: `max_mc_per_month` fined a PR for MCs a DIFFERENT
 * agency had approved, and `min_shifts_per_week` let one agency's shifts satisfy
 * another's minimum.
 *
 * This replays BOTH queries side by side — the old unscoped one and the new
 * per-agency one — over production rows it does not touch. It writes nothing.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-penalty-window-agency-scope.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

async function rows(statement: any): Promise<any[]> {
  const res: any = await db.execute(statement);
  return res.rows ?? res;
}

async function main() {
  // Candidates come from PRODUCTION rows, never from fixtures this script
  // creates: a probe that builds its own data can only certify its own idea of
  // the bug. Zero candidates must SKIP, loudly — it is not a pass.
  const candidates = await rows(sql`
    SELECT sa.pr_id,
           to_char(date_trunc('month', s.shift_date::date), 'YYYY-MM-01') AS month_start,
           count(DISTINCT sa.agency_id)::int AS agencies,
           count(*)::int AS assignments
      FROM main.shift_assignment sa
      JOIN main.shift s ON s.id = sa.shift_id
     GROUP BY 1, 2
    HAVING count(DISTINCT sa.agency_id) > 1
     ORDER BY agencies DESC, assignments DESC
     LIMIT 5`);

  console.log('\n=== PR-months touching more than one agency ===');
  if (candidates.length === 0) {
    console.log('  NONE FOUND — this probe proves NOTHING today.');
    console.log('  Not a pass: it means no PR in this database worked for two');
    console.log('  agencies in one month, so the leak had nothing to leak.');
    process.exit(0);
  }
  for (const c of candidates) console.log('  ', JSON.stringify(c));

  for (const target of candidates) {
  const { pr_id, month_start } = target;

  const perAgency = await rows(sql`
    SELECT coalesce(a.name, '(agency row missing)') AS agency,
           count(*)::int AS assignments,
           count(*) FILTER (WHERE sa.status = 'leave_approved')::int AS mc_approved,
           count(*) FILTER (WHERE sa.status = 'completed')::int AS completed
      FROM main.shift_assignment sa
      JOIN main.shift s ON s.id = sa.shift_id
      LEFT JOIN main.agency a ON a.id = sa.agency_id
     WHERE sa.pr_id = ${pr_id}
       AND date_trunc('month', s.shift_date::date) = ${month_start}::date
     GROUP BY 1
     ORDER BY 1`);

  const prName = (
    await rows(sql`
      SELECT coalesce(up.full_name, u.username) AS name
        FROM main."user" u
        LEFT JOIN main.user_profile up ON up.user_id = u.id
       WHERE u.id = ${pr_id}`)
  )[0]?.name;

  console.log(`\n=== ${prName ?? pr_id} · month starting ${month_start} ===`);
  console.log('  What the FIXED query returns — one row per agency, each its own answer:');
  for (const r of perAgency) console.log('  ', JSON.stringify(r));

  const totalMc = perAgency.reduce((n, r) => n + r.mc_approved, 0);
  const totalAssign = perAgency.reduce((n, r) => n + r.assignments, 0);
  const worstMc = Math.max(...perAgency.map((r) => r.mc_approved));

  console.log('\n=== VERDICT ===');
  console.log(`  OLD mcThisMonth (no agency term)  : ${totalMc}`);
  console.log(`  NEW mcThisMonth (worst single agency): ${worstMc}`);
  console.log(`  OLD assignedThisMonth             : ${totalAssign}`);
  if (totalMc > worstMc) {
    console.log(`  ⚠️  OVER-COUNTED BY ${totalMc - worstMc} MC. Against a max_mc_per_month`);
    console.log('     cap, every agency here was reading the others\' approvals,');
    console.log('     and the fine detail line would have printed that number.');
  } else if (totalAssign > Math.max(...perAgency.map((r) => r.assignments))) {
    console.log('  ⚠️  No MC to over-count this month, but the OPPORTUNITY figures');
    console.log('     still merged agencies — min_shifts_per_week was satisfied by');
    console.log("     shifts the judging agency never offered.");
  } else {
    console.log('  No divergence in this particular month.');
  }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
