/**
 * ONE-TIME CLEAN-UP — duplicate LIVE plan rows left by the lost close step
 * (28 Sep 2026).
 *
 * The 3 Sep 2026 merge (b3b577f3) dropped `applyPlanChangeToLedger`'s close
 * loop, so a plan switch from then on opened a new plan row and left the old one
 * live beside it — two live plans for one org, which the tier job iterates twice
 * and the last-plan guard reads as cover. The close is restored in
 * apply-plan-change.ts; this closes whatever the gap left behind.
 *
 * For every subscriber holding more than one live PLAN row, all but the newest
 * are closed exactly as the restored switch closes them — status 'expired',
 * `ended_at` stamped — each at the moment the NEXT row started, which is when
 * that switch happened (see `pickSupersededLivePlans`).
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_close-duplicate-live-plans.ts          # dry run: counts only
 *   npx tsx --tsconfig tsconfig.json src/scripts/_close-duplicate-live-plans.ts --apply  # write
 *
 * Prints COUNTS only — no names, no ids. NEVER touches an invoice or a credit:
 * the ones minted against the extra rows are counted for a human to review,
 * because whether one is a double charge is a billing decision, not a script's.
 * Re-running is a no-op: once each subscriber holds one live plan there is
 * nothing left to pick.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { lockLivePlanRows } from '@/features/subscription/plan-limit';
import {
  type LivePlanRow,
  pickSupersededLivePlans,
} from '@/features/member-subscription/plan-lane-rules';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'close-duplicate-live-plans-2026-09-28';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

type LiveRow = {
  id: string;
  subscriber_type: string;
  subscriber_id: string;
  started_at: string | Date;
  created_at: string | Date;
};

/**
 * "Live plan row" — the shared definition: `ended_at` unset, a live status
 * (`active` / `past_due`), and on the PLAN lane (an add-on is held beside a
 * plan and is never a duplicate of one).
 */
const LIVE_PLAN_ROW = sql`
  m.ended_at is null
  and m.status in ('active', 'past_due')
  and (m.subscription_id is null or exists (
        select 1 from main.subscription s
         where s.id = m.subscription_id and s.kind = 'plan'))`;

async function main() {
  const rows = toRows<LiveRow>(
    await db.execute(sql`
      select m.id, m.subscriber_type::text as subscriber_type, m.subscriber_id,
             m.started_at, m.created_at
        from main.member_subscription m
       where ${LIVE_PLAN_ROW}`),
  );
  const live: LivePlanRow[] = rows.map((row) => ({
    id: row.id,
    subscriberType: row.subscriber_type,
    subscriberId: row.subscriber_id,
    startedAt: new Date(row.started_at),
    createdAt: new Date(row.created_at),
  }));

  const superseded = pickSupersededLivePlans(live);
  const lanes = new Map<string, { subscriberType: string; subscriberId: string }>();
  for (const row of superseded) {
    lanes.set(`${row.subscriberType}|${row.subscriberId}`, {
      subscriberType: row.subscriberType,
      subscriberId: row.subscriberId,
    });
  }
  const lanesOf = (type: string) => [...lanes.values()].filter((l) => l.subscriberType === type).length;

  // What the extra rows were billed. Joined on the moment each one was
  // superseded, so a charge for a period that began AFTER the newer plan took
  // over — the one that could be a double charge — is counted on its own.
  let invoices = { total: 0, period: 0, upgrade: 0, unpaid: 0, paid: 0, afterTakeover: 0 };
  let credits = 0;
  if (superseded.length > 0) {
    // ⚠️ Built with sql.join, NOT `${array}::uuid[]`: drizzle renders a JS
    // array as a parenthesised list — `($1, $2)::uuid[]` — which Postgres
    // rejects. That path only runs when duplicates exist, so a clean dry run
    // would never have shown it.
    const ids = sql.join(
      superseded.map((row) => sql`${row.id}`),
      sql`, `,
    );
    const endedAts = sql.join(
      superseded.map((row) => sql`${row.endedAt.toISOString()}`),
      sql`, `,
    );
    const [invoiceCounts] = toRows<typeof invoices>(
      await db.execute(sql`
        with extra(id, superseded_at) as (
          select * from unnest(array[${ids}]::uuid[], array[${endedAts}]::timestamptz[])
        )
        select count(*)::int as total,
               count(*) filter (where i.kind = 'period')::int as period,
               count(*) filter (where i.kind = 'upgrade')::int as upgrade,
               count(*) filter (where i.status = 'unpaid')::int as unpaid,
               count(*) filter (where i.status = 'paid')::int as paid,
               count(*) filter (
                 where i.period_start >= (e.superseded_at at time zone 'Asia/Kuala_Lumpur')::date
               )::int as "afterTakeover"
          from main.subscription_invoice i
          join extra e on e.id = i.member_subscription_id`),
    );
    if (invoiceCounts) invoices = invoiceCounts;
    const [creditCount] = toRows<{ n: number }>(
      await db.execute(sql`
        select count(*)::int as n from main.subscription_credit c
         where c.member_subscription_id = any(array[${ids}]::uuid[])`),
    );
    credits = creditCount?.n ?? 0;
  }

  // Reported beside, never closed here: a live row for an organisation that
  // does not exist is not a DUPLICATE, and ending it is the admin's call
  // (Admin → Current Plan → Cancel subscription now lets them).
  const [ghosts] = toRows<{ n: number }>(
    await db.execute(sql`
      select count(*)::int as n
        from main.member_subscription m
        left join main.outlet o on m.subscriber_type = 'outlet' and o.id = m.subscriber_id
        left join main.agency a on m.subscriber_type = 'agency' and a.id = m.subscriber_id
       where o.id is null and a.id is null and ${LIVE_PLAN_ROW}`),
  );

  let closed = 0;
  if (APPLY && lanes.size > 0) {
    await db.transaction(async (tx) => {
      for (const lane of lanes.values()) {
        if (lane.subscriberType !== 'outlet' && lane.subscriberType !== 'agency') continue;
        // Re-read under the lane lock the live switch takes: a plan may have
        // moved since the read above, and this must close only what is still
        // a duplicate NOW.
        const fresh = await lockLivePlanRows(tx, {
          subscriberType: lane.subscriberType,
          subscriberId: lane.subscriberId,
        });
        const pick = pickSupersededLivePlans(
          fresh.map((row) => ({
            id: row.id,
            subscriberType: row.subscriberType,
            subscriberId: row.subscriberId,
            startedAt: row.startedAt,
            createdAt: row.createdAt,
          })),
        );
        for (const row of pick) {
          const result = await tx.execute(sql`
            update main.member_subscription
               set status = 'expired',
                   ended_at = ${row.endedAt},
                   updated_at = now(),
                   updated_by = ${ACTOR}
             where id = ${row.id}
               and ended_at is null`);
          closed += Number((result as { rowCount?: number }).rowCount ?? 0);
        }
      }
    });
  }

  console.log(`mode: ${APPLY ? 'APPLY' : 'dry run (pass --apply to write)'}`);
  console.log(`live plan rows scanned:                             ${live.length}`);
  console.log(
    `subscribers holding more than one live plan row:    ${lanes.size} (outlets ${lanesOf('outlet')}, agencies ${lanesOf('agency')})`,
  );
  console.log(`extra live plan rows (all but the newest each):     ${superseded.length}`);
  console.log(
    `invoices minted against those extra rows:           ${invoices.total} ` +
      `(period ${invoices.period}, upgrade ${invoices.upgrade}; unpaid ${invoices.unpaid}, paid ${invoices.paid})`,
  );
  console.log(`  of which bill a period begun after the newer plan took over: ${invoices.afterTakeover}`);
  console.log(`downgrade credits held on those extra rows:         ${credits}`);
  console.log(
    `live plan rows whose organisation does not exist:   ${ghosts?.n ?? 0} (not touched here — cancel from Admin → Current Plan)`,
  );
  if (APPLY) console.log(`rows closed:                                        ${closed}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 500));
    process.exit(1);
  });
