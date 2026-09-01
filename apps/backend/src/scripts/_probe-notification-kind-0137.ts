/**
 * Proves migration 0137's enum value actually reached the DATABASE.
 *
 * Not paranoia: `pnpm migrate:deploy` has been observed writing a migration into
 * the journal WITHOUT running its DDL, which leaves the ledger claiming a change
 * the database never received. An enum value is the sharpest version of that
 * failure — every insert of the new kind fails at runtime, inside a job, at
 * 03:00, where nobody is watching.
 *
 * Read-only. One SELECT against the catalogue; writes nothing, deletes nothing.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { notificationKindValues } from '@/features/notification/notification.model.js';
import { adminRequestStatusValues } from '@/features/admin-request/admin-request.model.js';

async function readEnum(typeName: string): Promise<string[]> {
  const result = await db.execute(sql`
    select e.enumlabel::text as label
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = ${typeName} and n.nspname = 'main'
    order by e.enumsortorder
  `);
  const rows = (result as unknown as { rows?: Array<{ label: string }> }).rows ?? [];
  return rows.map((row) => row.label);
}

/**
 * Compares one Postgres enum against the code's own list, BOTH ways.
 *
 * A value in code but not in the database fails on insert, at runtime, usually
 * inside a job. One in the database but not in code is a value nothing can ever
 * write, which reads like a feature that exists.
 */
async function check(typeName: string, codeValues: readonly string[], expect: string) {
  const inDb = await readEnum(typeName);
  const missingFromDb = codeValues.filter((k) => !inDb.includes(k));
  const missingFromCode = inDb.filter((k) => !codeValues.includes(k));
  const present = inDb.includes(expect);

  console.log(`\n[${typeName}]`);
  console.log(`  database / code      : ${inDb.length} / ${codeValues.length}`);
  console.log(`  '${expect}' present  : ${present}`);
  console.log(`  missing from database: ${missingFromDb.join(', ') || 'none'}`);
  console.log(`  missing from code    : ${missingFromCode.join(', ') || 'none'}`);
  return present && missingFromDb.length === 0;
}

/**
 * 0139 is a COLUMN plus a CHECK, not an enum value, so it needs its own probe —
 * `ADD COLUMN IF NOT EXISTS` and a guarded `ADD CONSTRAINT` are exactly the kind
 * of statements a half-run migration leaves half-applied.
 */
async function checkWalletColumn() {
  const col = await db.execute(sql`
    select data_type::text as type, character_maximum_length as len
    from information_schema.columns
    where table_schema = 'main'
      and table_name = 'payment_method'
      and column_name = 'wallet_provider'
  `);
  const colRows =
    (col as unknown as { rows?: Array<{ type: string; len: number | null }> }).rows ?? [];

  const con = await db.execute(sql`
    select conname::text as name
    from pg_constraint
    where conname = 'payment_method_wallet_provider'
  `);
  const conRows = (con as unknown as { rows?: Array<{ name: string }> }).rows ?? [];

  console.log('\n[payment_method.wallet_provider]  (migration 0139)');
  console.log(
    `  column present       : ${colRows.length > 0}` +
      (colRows[0] ? ` (${colRows[0].type}, len ${colRows[0].len})` : ''),
  );
  console.log(`  CHECK present        : ${conRows.length > 0}`);
  return colRows.length > 0 && conRows.length > 0;
}

async function main() {
  const a = await check(
    'notification_kind',
    notificationKindValues,
    'subscription_invoice_opened',
  );
  const b = await check('admin_request_status', adminRequestStatusValues, 'withdrawn');
  const c = await checkWalletColumn();

  const ok = a && b && c;
  console.log(`\n${ok ? 'RESULT: PASS' : 'RESULT: FAIL'}`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
