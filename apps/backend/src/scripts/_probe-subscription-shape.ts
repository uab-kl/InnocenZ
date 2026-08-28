/**
 * Does the live ledger actually match the model the owner describes?
 *
 *   1. Is a subscription active on EVERY outlet and agency?
 *   2. Can an outlet hold TWO — a plan plus the POS add-on?
 *   3. Does any agency hold more than one?
 *
 * Read-only. Answers from the rows rather than from the schema's intent, because
 * "the table allows it" and "it is true today" are different questions.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? [];

async function main() {
  // 1. Coverage — orgs with no ACTIVE lane at all.
  const coverage = await db.execute(sql`
    select
      o.kind::text as kind,
      count(*)::int as total,
      count(*) filter (where ms.n is null or ms.n = 0)::int as without_subscription
    from (
      select 'outlet' as kind, id from "main"."outlet"
      union all
      select 'agency' as kind, id from "main"."agency"
    ) o
    left join (
      select subscriber_type::text as st, subscriber_id, count(*)::int as n
      from "main"."member_subscription"
      where status = 'active'
      group by 1, 2
    ) ms on ms.subscriber_id = o.id and ms.st = o.kind
    group by 1
    order by 1
  `);
  console.log('\n1. IS A SUBSCRIPTION ACTIVE ON EVERY ORG?');
  for (const r of rowsOf(coverage)) {
    console.log(
      `   ${String(r.kind).padEnd(7)} ${String(r.total).padStart(3)} total · ` +
        `${String(r.without_subscription).padStart(3)} with NO active subscription`,
    );
  }

  // 2/3. How many ACTIVE lanes each org holds, split plan vs add-on.
  const lanes = await db.execute(sql`
    select
      ms.subscriber_type::text as kind,
      count(*) filter (where s.kind = 'plan')::int as plans,
      count(*) filter (where s.kind = 'addon')::int as addons,
      count(*)::int as lanes,
      ms.subscriber_name as name
    from "main"."member_subscription" ms
    left join "main"."subscription" s on s.id = ms.subscription_id
    where ms.status = 'active'
    group by ms.subscriber_type, ms.subscriber_id, ms.subscriber_name
    having count(*) > 1
    order by 1, 5
  `);
  console.log('\n2. ORGS HOLDING MORE THAN ONE ACTIVE LANE');
  const multi = rowsOf(lanes);
  if (multi.length === 0) console.log('   (none)');
  for (const r of multi) {
    console.log(
      `   ${String(r.kind).padEnd(7)} ${String(r.name).padEnd(26)} ` +
        `${r.lanes} lanes = ${r.plans} plan + ${r.addons} add-on`,
    );
  }

  // Anyone holding two PLANS would break the "one plan at a time" rule.
  const twoPlans = await db.execute(sql`
    select ms.subscriber_type::text as kind, ms.subscriber_name as name, count(*)::int as plans
    from "main"."member_subscription" ms
    join "main"."subscription" s on s.id = ms.subscription_id
    where ms.status = 'active' and s.kind = 'plan'
    group by 1, 2
    having count(*) > 1
  `);
  console.log('\n3. ANY ORG ON TWO PLANS AT ONCE? (must be none)');
  const bad = rowsOf(twoPlans);
  console.log(bad.length === 0 ? '   none — rule holds' : `   ${bad.length} FOUND`);
  for (const r of bad) console.log(`   ${r.kind} ${r.name}: ${r.plans} plans`);

  // Which add-ons exist at all, and who may buy them.
  const addons = await db.execute(sql`
    select name, subscription_type::text as sold_to, kind::text as kind, price::text as price
    from "main"."subscription"
    where kind = 'addon'
    order by name
  `);
  console.log('\n4. ADD-ONS IN THE CATALOGUE');
  for (const r of rowsOf(addons)) {
    console.log(`   ${String(r.name).padEnd(22)} sold to ${r.sold_to} · RM ${r.price}`);
  }

  // Which rails are actually SAVED today. Matters before removing one from the
  // picker: a rail nobody holds can go quietly, one that is in use cannot.
  const rails = await db.execute(sql`
    select type::text as type, status::text as status, count(*)::int as n
    from "main"."payment_method"
    group by 1, 2
    order by 1, 2
  `);
  console.log('\n5. PAYMENT METHOD ROWS BY RAIL');
  const railRows = rowsOf(rails);
  if (railRows.length === 0) console.log('   (none saved at all)');
  for (const r of railRows) {
    console.log(`   ${String(r.type).padEnd(18)} ${String(r.status).padEnd(10)} ${r.n}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
