/**
 * READ-ONLY. Why can this shift not take another PR?
 *
 * The roster's refusal sentence blames HEADCOUNT ("already staffed — raise a
 * headcount"), but `shiftBlockedFor` reports `full` and `tier-full` separately
 * and only one of them is about headcount. This prints the shift's declared
 * MIX against who is actually on it, so the two can be told apart from data
 * rather than from the wording.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-shift-tier-demand.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

async function main() {
  const shifts: any = await db.execute(sql`
    SELECT s.id, s.event_name, s.shift_date, s.slot, s.quantity, s.status, o.name AS outlet
    FROM main.shift s
    JOIN main.outlet o ON o.id = s.outlet_id
    WHERE s.shift_date = '2026-08-24'
    ORDER BY s.created_at DESC`);
  const rows = shifts.rows ?? shifts;
  if (rows.length === 0) {
    console.log('SKIP — no shift on 2026-08-24 to inspect.');
    process.exit(1);
  }

  for (const s of rows) {
    console.log(`\n=== ${s.outlet} · ${s.event_name} · ${s.slot} · quantity ${s.quantity} · status ${s.status} ===`);

    const tiers: any = await db.execute(sql`
      SELECT kind, tier, pr_count FROM main.shift_pay_tier
      WHERE shift_id = ${s.id} ORDER BY tier`);
    const demand = tiers.rows ?? tiers;
    console.log('-- the MIX the outlet declared (shift_pay_tier) --');
    console.table(demand);
    const totalAsked = demand.reduce((n: number, r: any) => n + Number(r.pr_count), 0);
    console.log(`  total asked across tiers: ${totalAsked} · shift quantity: ${s.quantity} · unallocated leftover: ${Math.max(0, s.quantity - totalAsked)}`);

    const staffed: any = await db.execute(sql`
      SELECT ap.tier, count(*)::int AS staffed
      FROM main.shift_assignment sa
      LEFT JOIN main.agency_pr ap
        ON ap.user_id = sa.pr_id AND ap.agency_id = sa.agency_id
      WHERE sa.shift_id = ${s.id}
        AND sa.status NOT IN ('cancelled', 'no_show', 'leave_approved')
      GROUP BY ap.tier ORDER BY ap.tier`);
    console.log('-- who is actually ON it (shift_assignment) --');
    console.table(staffed.rows ?? staffed);

    const requested: any = await db.execute(sql`
      SELECT count(*)::int AS named FROM main.shift_pr_request WHERE shift_id = ${s.id}`);
    console.log(`  named by the venue (shift_pr_request): ${(requested.rows ?? requested)[0].named}`);
    console.log('  ^ a WANT, not a booking — these must NOT consume a seat.');

    // Which tier buckets still have room, by the same arithmetic shiftBlockedFor uses.
    const have = new Map<string, number>(
      (staffed.rows ?? staffed).map((r: any) => [r.tier ?? 'none', Number(r.staffed)]),
    );
    console.log('-- seats left, per tier --');
    console.table(
      demand.map((d: any) => ({
        tier: d.tier,
        asked: Number(d.pr_count),
        staffed: have.get(d.tier) ?? 0,
        seats_left: Number(d.pr_count) - (have.get(d.tier) ?? 0),
      })),
    );
  }

  const roster: any = await db.execute(sql`
    SELECT ap.tier, count(*)::int AS prs
    FROM main.agency_pr ap
    JOIN main.agency a ON a.id = ap.agency_id
    WHERE a.name ILIKE '%Why We Met%' AND ap.approve_status = 'approved'
    GROUP BY ap.tier ORDER BY ap.tier`);
  console.log("\n=== the agency's own roster, by tier ===");
  console.table(roster.rows ?? roster);
  console.log('  A tier the agency has NOBODY for is a seat it can never fill.');

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
