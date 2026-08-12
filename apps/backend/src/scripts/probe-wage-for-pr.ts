/**
 * READ-ONLY. Why does the assign sheet quote THIS wage for THIS PR?
 *
 * Prints, for one day's shifts: the shift row, the per-shift pay-tier override
 * rows, the outlet's tier-rate card, and then — through the real resolver the
 * sheet and `create` both use — the outcome for every active PR. If one PR reads
 * differently from the others, the rows above it say why rather than leaving it
 * to inference.
 *
 * Column lists come from information_schema, so nothing here depends on a guess
 * about a column name.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-wage-for-pr.ts [YYYY-MM-DD]
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { ShiftAssignmentRepositoryClass } from '../features/shift-assignment/shift-assignment.repository';
import {
  PR_TIER_TO_OUTLET_LABEL,
  resolveTierWageOutcomesForShifts,
} from '../features/shift-assignment/resolve-tier-wages';

const DATE = process.argv[2] ?? '2026-08-12';

function show(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `${k}=${v instanceof Date ? v.toISOString().slice(0, 10) : String(v)}`)
    .join(' · ');
}

async function main() {
  const repo = new ShiftAssignmentRepositoryClass();

  const shifts = await db.execute(sql`
    select s.id, s.outlet_id, s.shift_date, s.slot, s.event_name, s.quantity,
           s.pay_per_hour, s.status, o.name as outlet_name
      from main.shift s
      join main.outlet o on o.id = s.outlet_id
     where s.shift_date = ${DATE}
     order by o.name, s.slot
  `);
  const shiftRows = shifts.rows as Record<string, string>[];
  console.log(`\n=== shifts on ${DATE}: ${shiftRows.length} ===`);
  if (shiftRows.length === 0) {
    console.log('None. Pass a different date as argv[2].');
    process.exit(0);
  }
  for (const s of shiftRows) console.log('  ' + show(s));

  for (const s of shiftRows) {
    console.log(`\n--- ${s.outlet_name} · ${s.slot ?? 'no slot'} (${s.id}) ---`);

    const overrides = await db.execute(
      sql`select * from main.shift_pay_tier where shift_id = ${s.id} order by tier`,
    );
    console.log(`  shift_pay_tier rows: ${overrides.rows.length}`);
    for (const r of overrides.rows as Record<string, unknown>[]) console.log('    ' + show(r));

    // Find the outlet rate-card table rather than assume its name, so a rename
    // shows up as "no table" instead of masquerading as "no rows".
    const rateTable = await db.execute(sql`
      select table_name from information_schema.tables
       where table_schema = 'main' and table_name like '%tier_rate%'
    `);
    for (const t of rateTable.rows as { table_name: string }[]) {
      const rates = await db.execute(
        sql.raw(`select * from main.${t.table_name} where outlet_id = '${s.outlet_id}'`),
      );
      console.log(`  ${t.table_name} rows for this outlet: ${rates.rows.length}`);
      for (const r of rates.rows as Record<string, unknown>[]) console.log('    ' + show(r));
    }
  }

  // `main.pr` does not exist — the feature was renamed and the tier lives
  // elsewhere. Find every table that actually carries a `tier` column instead of
  // guessing a second time.
  const tierTables = await db.execute(sql`
    select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
      from information_schema.columns
     where table_schema = 'main'
       and table_name in (
         select table_name from information_schema.columns
          where table_schema = 'main' and column_name = 'tier'
       )
     group by table_name
  `);
  console.log('\n=== tables carrying a `tier` column ===');
  for (const t of tierTables.rows as { table_name: string; cols: string }[]) {
    console.log(`  main.${t.table_name}: ${t.cols}`);
  }

  const prs = await db.execute(sql`
    select ap.user_id as id, ap.tier, ap.kpi_tier, ap.agency_id,
           ap.approve_status as status,
           '' as nickname,
           to_jsonb(u) ->> 'name' as name,
           to_jsonb(u) as user_row
      from main.agency_pr ap
      join main."user" u on u.id = ap.user_id
  `);
  const prRows = prs.rows as Record<string, string>[];

  console.log(`\n=== what the assign sheet quotes each active PR (${prRows.length}) ===`);
  for (const pr of prRows) {
    const outcomes = await resolveTierWageOutcomesForShifts(
      repo,
      { tier: pr.tier ?? '' },
      shiftRows.map((s) => ({ shiftId: s.id, outletId: s.outlet_id })),
    );
    const label = PR_TIER_TO_OUTLET_LABEL[pr.tier] ?? '(no label)';
    const quotes = shiftRows
      .map((s) => {
        const o = outcomes.get(s.id);
        const text =
          o?.kind === 'priced'
            ? `RM${o.wage}`
            : o?.kind === 'commission_only'
              ? 'commission-only'
              : `UNPRICED(${o?.tierLabel ?? '-'})`;
        return `${s.outlet_name}/${s.slot ?? '-'} → ${text}`;
      })
      .join('  |  ');
    console.log(`  ${pr.nickname || pr.name}  tier=${pr.tier} (${label})  ${quotes}`);
  }

  process.exit(0);
}

main();
