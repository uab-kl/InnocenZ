/**
 * DOES THE POST JOB SCREEN'S "REMAINING" MATCH THE SERVER'S ACTUAL ALLOWANCE?
 *
 * Owner, 12 Sep 2026: "for outlet need record down like the how many remaining
 * for the post job left".
 *
 * Two independent numbers exist today:
 *   CLIENT  prPerDayMax  — a hard-coded constant in outlet-demo.ts, looked up by
 *                          matching the plan's NAME, minus shifts it happens to
 *                          have loaded plus its own local drafts.
 *   SERVER  limitAmount  — subscription.limit_amount, minus sum(shift.quantity)
 *                          for the date across ALL non-draft shifts.
 *
 * The server's is the one that refuses the post. This compares them per venue.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

// The client's table, copied from apps/web/src/agency-portal/lib/outlet-demo.ts.
const CLIENT_CAP: Record<string, number> = {
  essential: 5, plus: 10, pro: 25, enterprise: 50, scale: 100, premier: 999,
};

const rows = await db.execute(sql`
  select o.name as outlet, ms.plan_name, s.limit_amount
  from main.member_subscription ms
  join main.outlet o on o.id = ms.subscriber_id
  left join main.subscription s on s.id = ms.subscription_id
  where ms.subscriber_type = 'outlet'
    and ms.ended_at is null
    and coalesce(s.kind::text, 'plan') = 'plan'
  order by o.name
`);

let agree = 0, disagree = 0, unknown = 0;
console.log('venue                          plan          SERVER limit   CLIENT cap   verdict');
for (const r of (rows.rows ?? rows) as any[]) {
  const planKey = String(r.plan_name ?? '').trim().toLowerCase();
  const client = CLIENT_CAP[planKey];
  const server = r.limit_amount === null || r.limit_amount === undefined ? null : Number(r.limit_amount);
  let verdict: string;
  if (client === undefined) { verdict = 'CLIENT HAS NO SUCH PLAN NAME -> falls back to demo store'; unknown++; }
  else if (server === null) { verdict = 'server unlimited, client caps at ' + client; disagree++; }
  else if (server === client) { verdict = 'agree'; agree++; }
  else { verdict = `DISAGREE by ${Math.abs(server - client)}`; disagree++; }
  console.log(
    String(r.outlet).slice(0, 30).padEnd(31) +
    String(r.plan_name ?? '(none)').slice(0, 13).padEnd(14) +
    String(server ?? 'unlimited').padEnd(15) +
    String(client ?? '(unknown)').padEnd(13) +
    verdict,
  );
}
console.log(`\n${agree} agree, ${disagree} disagree, ${unknown} plan name the client cannot resolve`);
process.exit(0);
