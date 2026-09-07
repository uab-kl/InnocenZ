/**
 * READ-ONLY. What is actually recorded in `penalty_charge`, and does the table
 * carry the void columns 0151 added?
 *
 * Written because a model column without its migration breaks every query on
 * the table it is added to — so the columns are proven present here BEFORE the
 * drizzle model claims they exist.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-penalty-charges.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

const rows = async (q: unknown) => {
  const r = await db.execute(q as never);
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows ?? [])) as Record<
    string,
    unknown
  >[];
};

async function main() {
  const cols = await rows(sql`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'main' and table_name = 'penalty_charge'
      and column_name in ('voided_at', 'voided_by', 'void_reason')
    order by column_name`);
  console.log('\n0151 VOID COLUMNS');
  if (cols.length === 0) console.log('  MISSING — run `pnpm migrate:deploy` from the repo root');
  for (const c of cols) {
    console.log(
      `  ok ${String(c.column_name).padEnd(12)} ${c.data_type} (nullable=${c.is_nullable})`,
    );
  }

  const charges = await rows(sql`
    select a.name as agency, u.username as pr, c.rule_type, c.week_start, c.fine_rm,
           c.detail, c.charged_at, c.voided_at, c.voided_by, c.void_reason, c.created_by
    from main.penalty_charge c
    join main.agency a on a.id = c.agency_id
    left join main."user" u on u.id = c.pr_id
    order by c.week_start desc, u.username`);
  console.log(`\nRECORDED CHARGES: ${charges.length}`);
  for (const c of charges) {
    const state = c.voided_at ? 'VOIDED' : c.charged_at ? 'billed' : 'owed';
    console.log(
      `  ${String(c.week_start).slice(0, 10)}  ${String(c.pr ?? '?').padEnd(14)} ` +
        `${String(c.rule_type).padEnd(20)} RM ${String(c.fine_rm).padStart(8)}  ${state.padEnd(7)}` +
        `  by ${c.created_by}` +
        (c.voided_at ? `  · voided by ${c.voided_by} (${c.void_reason ?? 'no reason'})` : '') +
        `\n        ${c.detail}`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
