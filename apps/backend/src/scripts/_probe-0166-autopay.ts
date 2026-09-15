/**
 * Did 0166 land, and what would the auto-charge job find today?
 *
 * Importers/callers: none — standalone probe, run by hand.
 * Affected API: none. READ-ONLY.
 * Owner's instruction: "go ahead build it and update the fpx billing runbook with
 * how to implement it steps by steps".
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-0166-autopay.ts
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db } from '@/db/index';

const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));

async function main() {
  // drizzle-kit applies a journal entry only when its `when` is newer than the
  // newest ledgered created_at — the 0152/0153 trap.
  console.log('last ledgered migrations:');
  console.table(
    rows(
      await db.execute(sql`
        select id, created_at, to_timestamp(created_at / 1000) as at
          from drizzle.__drizzle_migrations order by created_at desc limit 3`),
    ),
  );

  const kinds = rows(
    await db.execute(sql`
      select e.enumlabel from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'main' and t.typname = 'notification_kind'
       order by e.enumsortorder`),
  ).map((row) => row.enumlabel);
  console.log('notification_kind:', kinds.join(', '));
  console.log('subscription_autopay_failed present:', kinds.includes('subscription_autopay_failed'));

  console.log('payment_method rows by type / wallet / token / default:');
  console.table(
    rows(
      await db.execute(sql`
        select type, wallet_provider, status, is_default, auto_pay,
               gateway, (gateway_token is not null) as has_token, count(*)::int as n
          from main.payment_method
         group by 1, 2, 3, 4, 5, 6, 7 order by 1, 2`),
    ),
  );

  console.log('unpaid, started bills (what the job would scan, before the method join):');
  console.table(
    rows(
      await db.execute(sql`
        select ms.subscriber_type, count(*)::int as unpaid_started
          from main.subscription_invoice si
          join main.member_subscription ms on ms.id = si.member_subscription_id
         where si.status = 'unpaid'
           and si.period_start <= (now() at time zone 'Asia/Kuala_Lumpur')::date
         group by 1`),
    ),
  );

  console.log('existing automatic attempts:');
  console.table(
    rows(
      await db.execute(sql`
        select status, count(*)::int as n from main.subscription_payment
         where created_by = 'job:auto-charge' group by 1`),
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
