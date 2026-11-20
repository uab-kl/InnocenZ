/**
 * READ-ONLY. The facts the PR "request detach" slice (20 Nov 2026) stands on:
 * how old each live membership is, what admin_request / notification accept
 * today, whether migration 0171 has landed, and any pending detach requests.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-pr-detach-request.ts
 *
 * Every statement is a SELECT. Nothing here writes.
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
  await q('1. agency_pr by status',
    sql`SELECT approve_status::text AS status, count(*) AS n,
               min(created_at) AS oldest_created, max(created_at) AS newest_created
        FROM main.agency_pr GROUP BY 1 ORDER BY 1`);

  await q('2. agency_pr columns (is approved_at there yet?)',
    sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'main' AND table_name = 'agency_pr' ORDER BY ordinal_position`);

  await q('3. admin_request columns (is subject_user_id there yet?)',
    sql`SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'main' AND table_name = 'admin_request' ORDER BY ordinal_position`);

  await q('4. enum labels — admin_request_type / notification_kind',
    sql`SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'main' AND t.typname IN ('admin_request_type', 'notification_kind')
        GROUP BY t.typname`);

  await q('5. Triggers in schema main (none expected before 0171)',
    sql`SELECT c.relname AS table_name, tg.tgname, pg_get_triggerdef(tg.oid) AS def
        FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'main' AND NOT tg.tgisinternal`);

  await q('6. LIVE memberships per agency: under one year by created_at, and created vs updated',
    sql`SELECT a.name AS agency, count(*) AS live,
               count(*) FILTER (WHERE ap.created_at > now() - interval '365 days') AS under_1y_by_created,
               count(*) FILTER (WHERE ap.updated_at > ap.created_at + interval '1 day') AS touched_after_create
        FROM main.agency_pr ap JOIN main.agency a ON a.id = ap.agency_id
        WHERE ap.approve_status IN ('approved', 'leave_pending')
        GROUP BY a.name ORDER BY a.name`);

  await q('7. Membership-decision notifications (could they date an approval better than created_at?)',
    sql`SELECT kind::text, count(*) AS n, min(created_at) AS first, max(created_at) AS last
        FROM main.notification
        WHERE payload::text ILIKE '%approveStatus%'
        GROUP BY 1`);

  await q('8. Migration ledger watermark',
    sql`SELECT max(created_at) AS max_when, count(*) AS rows FROM drizzle.__drizzle_migrations`);

  await q('9. admin_request rows by type/status',
    sql`SELECT type::text, status::text, count(*) AS n FROM main.admin_request GROUP BY 1, 2 ORDER BY 1, 2`);

  // Only meaningful once 0171 has applied; FAILS (harmlessly) before that.
  await q('10. pr_detach requests (after 0171)',
    sql`SELECT r.id, r.status::text, r.subscriber_name, r.subject_user_id, r.created_at
        FROM main.admin_request r WHERE r.type::text = 'pr_detach' ORDER BY r.created_at DESC LIMIT 20`);

  await q('11. approved_at vs created_at on live rows (after 0171)',
    sql`SELECT approve_status::text AS status, count(*) AS n,
               count(*) FILTER (WHERE approved_at IS NULL) AS null_approved_at,
               count(*) FILTER (WHERE approved_at > now() - interval '365 days') AS under_1y
        FROM main.agency_pr GROUP BY 1 ORDER BY 1`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
