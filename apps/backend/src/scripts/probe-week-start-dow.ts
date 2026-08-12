/**
 * READ-ONLY. Does the LIVE data agree that a payroll week runs Sunday–Saturday?
 *
 * The code was unified on Sun–Sat (12 Aug 2026), but code and rows are separate
 * claims: any week written during the Monday era is still Monday-anchored on
 * disk, and `reanchor-voucher-weeks.ts` exists because that has happened before.
 *
 * Every `week_start` / `week_end` column is discovered from information_schema
 * rather than listed by hand — a table left out of a hardcoded list would be
 * reported as "clean" simply by never being looked at.
 *
 * SELECTs only. Safe against the shared database.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-week-start-dow.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** week_start must be Sunday (0); week_end must be Saturday (6). */
function expectedDow(column: string): number {
  return column === 'week_end' ? 6 : 0;
}

/** information_schema is trusted, but the names are interpolated — gate them anyway. */
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

async function main() {
  const cols = await db.execute(sql`
    select table_name, column_name
      from information_schema.columns
     where table_schema = 'main'
       and column_name in ('week_start', 'week_end')
     order by table_name, column_name
  `);

  const targets = (cols.rows as { table_name: string; column_name: string }[]).filter(
    (c) => SAFE_IDENT.test(c.table_name) && SAFE_IDENT.test(c.column_name),
  );

  if (targets.length === 0) {
    console.log('No week_start/week_end columns found in schema main — check the schema name.');
    process.exit(1);
  }

  console.log(`Checking ${targets.length} column(s) in schema main\n`);

  let totalRows = 0;
  let totalBad = 0;

  for (const { table_name: table, column_name: column } of targets) {
    const want = expectedDow(column);
    const dist = await db.execute(
      sql.raw(`
        select extract(dow from ${column})::int as dow, count(*)::int as n
          from main.${table}
         where ${column} is not null
         group by 1
         order by 1
      `),
    );

    const rows = dist.rows as { dow: number; n: number }[];
    const n = rows.reduce((sum, r) => sum + Number(r.n), 0);
    const bad = rows.filter((r) => Number(r.dow) !== want);
    const badCount = bad.reduce((sum, r) => sum + Number(r.n), 0);
    totalRows += n;
    totalBad += badCount;

    const spread = rows.map((r) => `${DOW_NAMES[Number(r.dow)]}=${r.n}`).join(' ');
    const verdict =
      n === 0
        ? 'EMPTY — proves nothing'
        : badCount === 0
          ? `OK (all ${DOW_NAMES[want]})`
          : `🔴 ${badCount} of ${n} NOT ${DOW_NAMES[want]}`;
    console.log(`main.${table}.${column}  ${verdict}`);
    console.log(`  ${n} row(s)${spread ? ` · ${spread}` : ''}`);

    if (badCount > 0) {
      const offenders = await db.execute(
        sql.raw(`
          select ${column} as val, extract(dow from ${column})::int as dow, count(*)::int as n
            from main.${table}
           where ${column} is not null and extract(dow from ${column})::int <> ${want}
           group by 1, 2
           order by 1
           limit 20
        `),
      );
      for (const r of offenders.rows as { val: string; dow: number; n: number }[]) {
        const iso = String(r.val).slice(0, 10);
        console.log(`    ${iso} (${DOW_NAMES[Number(r.dow)]}) × ${r.n}`);
      }

      // The whole row, not just the date: whether a mis-anchored week can be
      // corrected safely depends on what has already happened to it (a draft is
      // not an issued invoice), and that is not visible from the date alone.
      const detail = await db.execute(
        sql.raw(`
          select * from main.${table}
           where ${column} is not null and extract(dow from ${column})::int <> ${want}
           limit 5
        `),
      );
      for (const row of detail.rows as Record<string, unknown>[]) {
        const shown = Object.entries(row)
          .filter(([k]) => !k.startsWith('source_') && k !== 'created_at' && k !== 'updated_at')
          .map(([k, v]) => `${k}=${v instanceof Date ? v.toISOString().slice(0, 10) : String(v)}`)
          .join(' · ');
        console.log(`      ${shown}`);
      }
    }
    console.log('');
  }

  console.log('—');
  console.log(
    totalBad === 0
      ? `All ${totalRows} dated week row(s) agree with Sun–Sat.`
      : `🔴 ${totalBad} of ${totalRows} row(s) do NOT agree with Sun–Sat.`,
  );
  // An empty table cannot vouch for anything — say so rather than let a zero
  // count read as a pass.
  if (totalRows === 0) console.log('⚠️  Nothing was dated, so this run proves nothing.');
  process.exit(0);
}

main();
