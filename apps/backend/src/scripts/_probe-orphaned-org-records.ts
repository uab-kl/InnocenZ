/**
 * WHICH ROWS STILL POINT AT AN ORGANISATION THAT NO LONGER EXISTS — READ ONLY.
 *
 * 22 Oct 2026: the outlet "Bear Lounge" was hard-deleted on 29 Sep, but its
 * Contacted plan request stayed in the admin's "need attention" count. Before
 * any clean-up is written, this asks the rows (CLAUDE.md Fix Rule 2):
 *   1. what the audit trail says deleted the outlet, and when;
 *   2. which columns name an outlet/agency id WITHOUT a foreign key (those are
 *      the ones a delete leaves dangling — an FK column would have cascaded or
 *      refused);
 *   3. every admin_request / member_subscription / invoice row whose org is gone.
 *
 * ⚠️ NOTHING HERE WRITES. One `begin read only` transaction, rolled back.
 * Prints ids, statuses and dates — never a name, phone or e-mail.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-orphaned-org-records.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { AdminRequestRepositoryClass } from '@/features/admin-request/admin-request.repository';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

function show(title: string, rows: unknown[]) {
  console.log(`\n=== ${title} ===`);
  if (rows.length === 0) {
    console.log('  (no rows)');
    return;
  }
  for (const r of rows) console.log('  ', JSON.stringify(r));
}

const ORG_GONE = sql`(
  (x.subscriber_type::text = 'outlet' and not exists (select 1 from main.outlet o where o.id = x.subscriber_id))
  or (x.subscriber_type::text = 'agency' and not exists (select 1 from main.agency a where a.id = x.subscriber_id)))`;

async function main() {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      const [ro] = toRows<{ ro: string }>(
        await tx.execute(
          sql`select current_setting('transaction_read_only') as ro`,
        ),
      );
      if (ro?.ro !== 'on')
        throw new Error('not read-only — refusing to continue');

      // `entity` is derived from the URL PATH (resolveEntityFromPath), so any
      // DELETE under /outlet/:id/… — a member removal, a geo-fence clear — logs as
      // "DELETE outlet". Whether the org itself still exists is the real question.
      show(
        'audit_logs — DELETE on an /outlet or /agency path, and whether that org still exists',
        toRows(
          await tx.execute(sql`
          select l.audit_log_id, l.entity, l.entity_id, l.portal, l.role,
                 to_char(l.created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI') as at_kl,
                 case l.entity
                   when 'outlet' then exists (select 1 from main.outlet o where o.id::text = l.entity_id)
                   when 'agency' then exists (select 1 from main.agency a where a.id::text = l.entity_id)
                 end as org_still_exists,
                 (select array_agg(k) from jsonb_object_keys(
                    case when jsonb_typeof(l.old_data) = 'object' then l.old_data else '{}'::jsonb end) k) as old_keys
            from main.audit_logs l
           where l.action = 'DELETE' and l.entity in ('outlet', 'agency')
             and l.created_at >= '2026-09-01'
           order by l.created_at`),
        ),
      );

      show(
        'audit_logs — anything naming the Bear Lounge request org 9d79b580…',
        toRows(
          await tx.execute(sql`
          select audit_log_id, action, entity, entity_id, portal,
                 to_char(created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI') as at_kl
            from main.audit_logs
           where entity_id like '9d79b580%' or old_data::text like '%9d79b580%' or new_data::text like '%9d79b580%'
           order by created_at
           limit 40`),
        ),
      );

      show(
        'orphaned rows: the org NAME they snapshot, and how many live orgs carry that name now',
        toRows(
          await tx.execute(sql`
          select 'admin_request' as tbl, x.id, x.subscriber_type::text as org_type, x.subscriber_name,
                 (select count(*)::int from main.outlet o where o.name = x.subscriber_name)
                   + (select count(*)::int from main.agency a where a.name = x.subscriber_name) as same_name_orgs_now
            from main.admin_request x where x.subscriber_id is not null and ${ORG_GONE}
          union all
          select 'member_subscription', x.id, x.subscriber_type::text, x.subscriber_name,
                 (select count(*)::int from main.outlet o where o.name = x.subscriber_name)
                   + (select count(*)::int from main.agency a where a.name = x.subscriber_name)
            from main.member_subscription x where ${ORG_GONE}`),
        ),
      );

      show(
        'columns named outlet_id / agency_id / subscriber_id and whether an FK covers them',
        toRows(
          await tx.execute(sql`
          select c.table_name, c.column_name,
                 exists (
                   select 1
                     from information_schema.key_column_usage k
                     join information_schema.table_constraints t
                       on t.constraint_name = k.constraint_name and t.table_schema = k.table_schema
                    where t.constraint_type = 'FOREIGN KEY' and k.table_schema = c.table_schema
                      and k.table_name = c.table_name and k.column_name = c.column_name
                 ) as has_fk
            from information_schema.columns c
           where c.table_schema = 'main'
             and c.column_name in ('outlet_id', 'agency_id', 'subscriber_id', 'org_id')
           order by has_fk, c.table_name, c.column_name`),
        ),
      );

      show(
        'admin_request rows whose organisation is gone',
        toRows(
          await tx.execute(sql`
          select x.id, x.type::text as type, x.status::text as status, x.subscriber_type::text as org_type,
                 x.subscriber_id as org_id, left(coalesce(x.message, ''), 12) as msg_head, x.created_by,
                 to_char(x.created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as created_kl,
                 exists (select 1 from main.member_subscription m where m.admin_request_id = x.id) as priced_a_plan
            from main.admin_request x
           where x.subscriber_id is not null and ${ORG_GONE}
           order by x.created_at`),
        ),
      );

      show(
        'admin_request rows with NO subscriber id at all, by status',
        toRows(
          await tx.execute(sql`
          select status::text as status, type::text as type, count(*)::int as n
            from main.admin_request where subscriber_id is null group by 1, 2 order by 1, 2`),
        ),
      );

      show(
        'member_subscription rows whose organisation is gone',
        toRows(
          await tx.execute(sql`
          select x.id, x.status::text as status, x.subscriber_type::text as org_type, x.subscriber_id as org_id,
                 x.plan_name, x.ended_at is not null as ended,
                 to_char(x.started_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as started_kl,
                 to_char(x.ended_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as ended_kl,
                 x.updated_by
            from main.member_subscription x
           where ${ORG_GONE}
           order by x.started_at`),
        ),
      );

      show(
        'subscription_invoice rows on a member_subscription whose organisation is gone',
        toRows(
          await tx.execute(sql`
          select i.id, i.status::text as status, i.member_subscription_id
            from main.subscription_invoice i
            join main.member_subscription x on x.id = i.member_subscription_id
           where ${ORG_GONE}
           order by i.created_at`),
        ),
      );

      // The denominator for the dashboard reads below: every request still
      // awaiting an answer, split by whether its org exists. A zero after the
      // rule only means something if this shows what the zero was taken from.
      show(
        'admin_request awaiting an answer, by whether the org exists',
        toRows(
          await tx.execute(sql`
          select x.status::text as status, not ${ORG_GONE} as org_exists, count(*)::int as n
            from main.admin_request x
           where x.status in ('pending', 'contacted')
           group by 1, 2 order by 1, 2`),
        ),
      );

      await tx.rollback();
    })
    .catch((e) => {
      if (String(e).includes('Rollback')) return;
      throw e;
    });

  // The admin dashboard's own three request reads, through the REAL repository
  // (SELECT-only paths): what "need attention" is built from after the
  // org-exists rule. Names are venue names, not personal data.
  const repository = new AdminRequestRepositoryClass();
  const pendingNegotiated = await repository.listPaginated({
    filter: { status: 'pending', negotiated: 'only' },
    page: 1,
    pageSize: 1,
  });
  const pending = await repository.listPaginated({
    filter: { status: 'pending' },
    page: 1,
    pageSize: 5,
  });
  const contacted = await repository.listPaginated({
    filter: { status: 'contacted' },
    page: 1,
    pageSize: 5,
  });
  show('dashboard reads after the org-exists rule', [
    {
      read: 'pending, negotiated only (Plan requests tile)',
      totalCount: pendingNegotiated.totalCount,
    },
    {
      read: 'pending (Quote for … to-dos)',
      totalCount: pending.totalCount,
      names: pending.records.map((r) => r.subscriberName),
    },
    {
      read: 'contacted (Finish quote: … to-dos)',
      totalCount: contacted.totalCount,
      names: contacted.records.map((r) => r.subscriberName),
    },
    {
      read: 'pending-count (bell / badges, all types)',
      totalCount: await repository.countPending(),
    },
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 800));
    process.exit(1);
  });
