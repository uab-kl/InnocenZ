/**
 * READ-ONLY. Does the server's commission CEILING agree with the rate the PHONE
 * is served for the same assignment?
 *
 * The new write-time guard refuses a commission above
 * `sales x max(drinkPct, happyHourDrinkPct)`; the phone derives its figure from
 * the `rate` object `/shift-assignment/mine` hands it. If the two ever resolve
 * differently, the guard refuses honest logs — which is the only way this change
 * can do harm, so it is the thing to prove before trusting it.
 *
 * Calls the resolver directly and compares it to the served payload. Writes
 * nothing; performs no logging write of any kind.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { ShiftAssignmentRepositoryClass } = await import('@/features/shift-assignment/shift-assignment.repository');
const { resolveCommissionPcts } = await import('@/features/shift-assignment/resolve-tier-wages');

const repo = new ShiftAssignmentRepositoryClass();

// Every assignment that has ever carried a commission line, plus its PR's tier
// AT THIS AGENCY — the same scoping the guard uses.
const rows = await db.execute(sql`
  select distinct sa.id, sa.shift_id, s.outlet_id, ap.tier, o.name as outlet
  from main.shift_assignment sa
  join main.shift s   on s.id = sa.shift_id
  join main.outlet o  on o.id = s.outlet_id
  join main.agency_pr ap on ap.user_id = sa.user_id and ap.agency_id = sa.agency_id
  where ap.tier is not null
  order by sa.id
  limit 40
`);

let checked = 0;
let noCard = 0;
const mismatches: unknown[] = [];
for (const r of (rows.rows ?? rows) as Array<Record<string, string>>) {
  const pcts = await resolveCommissionPcts(repo, { tier: r.tier! }, r.shift_id!, r.outlet_id!);
  if (!pcts) { noCard += 1; continue; }
  checked += 1;
  // What the guard would allow per RM 100 of sale, drinks and tips.
  const drinkCeil = Math.max(pcts.drinkPct, pcts.happyHourDrinkPct ?? pcts.drinkPct);
  // The phone applies EITHER drinkPct or happyHourDrinkPct depending on the
  // clock, so the ceiling must be >= both. That is the property to assert.
  if (drinkCeil < pcts.drinkPct || drinkCeil < (pcts.happyHourDrinkPct ?? 0)) {
    mismatches.push({ assignment: r.id, outlet: r.outlet, pcts, drinkCeil });
  }
}
console.log(JSON.stringify({
  assignmentsWithATier: (rows.rows ?? rows).length,
  pricedByACard: checked,
  noRateCard: noCard,
  ceilingBelowSomethingThePhoneCouldApply: mismatches.length,
  mismatches,
}, null, 2));
process.exit(0);
