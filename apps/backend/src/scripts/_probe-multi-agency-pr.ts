/**
 * READ-ONLY. Do real PRs belong to 2+ agencies, and are those agencies
 * actually assigning them shifts?
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-multi-agency-pr.ts
 */
import './_probe-env';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index';

async function q(label: string, statement: SQL) {
  try {
    const res: any = await db.execute(statement);
    const rows = res.rows ?? res;
    console.log(`\n=== ${label} === (${rows.length} rows)`);
    if (rows.length > 0) console.table(rows);
    else console.log('  (none)');
  } catch (e) {
    console.log(`\n=== ${label} === FAILED: ${(e as any).cause?.message ?? (e as Error).message}`);
  }
}

async function main() {
  await q('0. Agencies',
    sql`SELECT name, agency_code, status FROM main.agency ORDER BY name`);

  await q('1. Users with 2+ agency_pr rows (ANY status)',
    sql`SELECT ap.user_id, p.full_name, count(*) AS memberships,
               string_agg(a.name || '/' || ap.approve_status::text || '/tier=' || coalesce(ap.tier::text,'-'), '  |  ' ORDER BY ap.created_at) AS detail
        FROM main.agency_pr ap
        JOIN main.agency a ON a.id = ap.agency_id
        LEFT JOIN main.user_profile p ON p.user_id = ap.user_id
        GROUP BY ap.user_id, p.full_name
        HAVING count(*) > 1
        ORDER BY count(*) DESC`);

  await q('2. Users APPROVED at 2+ agencies',
    sql`SELECT ap.user_id, p.full_name, count(*) AS approved_at,
               string_agg(a.name || ' tier=' || coalesce(ap.tier::text,'-'), '  |  ') AS agencies
        FROM main.agency_pr ap
        JOIN main.agency a ON a.id = ap.agency_id
        LEFT JOIN main.user_profile p ON p.user_id = ap.user_id
        WHERE ap.approve_status = 'approved'
        GROUP BY ap.user_id, p.full_name
        HAVING count(*) > 1`);

  await q('3. PRs ASSIGNED shifts by 2+ different agencies',
    sql`SELECT sa.pr_id, p.full_name, count(DISTINCT sa.agency_id) AS agencies,
               string_agg(DISTINCT a.name, ' | ') AS which, count(*) AS assignments
        FROM main.shift_assignment sa
        JOIN main.agency a ON a.id = sa.agency_id
        LEFT JOIN main.user_profile p ON p.user_id = sa.pr_id
        GROUP BY sa.pr_id, p.full_name
        HAVING count(DISTINCT sa.agency_id) > 1
        ORDER BY count(*) DESC`);

  await q('4. Assigned by an agency the PR is NOT an approved member of',
    sql`SELECT p.full_name AS pr, a.name AS assigning_agency,
               coalesce(ap.approve_status::text,'** NO MEMBERSHIP ROW **') AS membership,
               sa.status, s.shift_date, s.slot
        FROM main.shift_assignment sa
        JOIN main.agency a ON a.id = sa.agency_id
        JOIN main.shift s ON s.id = sa.shift_id
        LEFT JOIN main.user_profile p ON p.user_id = sa.pr_id
        LEFT JOIN main.agency_pr ap ON ap.user_id = sa.pr_id AND ap.agency_id = sa.agency_id
        WHERE ap.id IS NULL OR ap.approve_status <> 'approved'
        ORDER BY s.shift_date DESC LIMIT 30`);

  await q('5. CROSS-AGENCY same-day double booking (same person, 2 agencies, same date)',
    sql`SELECT p.full_name AS pr, s1.shift_date,
               a1.name AS agency_a, s1.slot AS slot_a, o1.name AS venue_a, sa1.status AS st_a,
               a2.name AS agency_b, s2.slot AS slot_b, o2.name AS venue_b, sa2.status AS st_b
        FROM main.shift_assignment sa1
        JOIN main.shift s1 ON s1.id = sa1.shift_id
        JOIN main.agency a1 ON a1.id = sa1.agency_id
        LEFT JOIN main.outlet o1 ON o1.id = s1.outlet_id
        JOIN main.shift_assignment sa2 ON sa2.pr_id = sa1.pr_id AND sa2.id <> sa1.id
        JOIN main.shift s2 ON s2.id = sa2.shift_id AND s2.shift_date = s1.shift_date
        JOIN main.agency a2 ON a2.id = sa2.agency_id
        LEFT JOIN main.outlet o2 ON o2.id = s2.outlet_id
        LEFT JOIN main.user_profile p ON p.user_id = sa1.pr_id
        WHERE sa1.agency_id <> sa2.agency_id
          AND sa1.status NOT IN ('cancelled','no_show','leave_approved')
          AND sa2.status NOT IN ('cancelled','no_show','leave_approved')
          AND sa1.id < sa2.id
        ORDER BY s1.shift_date DESC LIMIT 30`);

  await q('6. Same person, 2+ vouchers in one week',
    sql`SELECT p.full_name AS pr, pv.week_start, count(*) AS vouchers,
               count(DISTINCT pv.agency_id) AS agencies,
               string_agg(a.name || '=RM' || coalesce(pv.net::text,'?'), ' | ') AS detail
        FROM main.payment_voucher pv
        JOIN main.agency a ON a.id = pv.agency_id
        LEFT JOIN main.user_profile p ON p.user_id = pv.pr_id
        GROUP BY p.full_name, pv.week_start
        HAVING count(*) > 1
        ORDER BY pv.week_start DESC LIMIT 30`);

  await q('7. Totals',
    sql`SELECT (SELECT count(*) FROM main.agency) AS agencies,
               (SELECT count(*) FROM main.agency_pr) AS memberships,
               (SELECT count(DISTINCT user_id) FROM main.agency_pr) AS distinct_prs,
               (SELECT count(*) FROM main.shift_assignment) AS assignments`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
