/**
 * READ-ONLY probe: where do the Manage-PR editor's fields actually live?
 *
 * The agency Manage-PR editor offers race / place / years-exp / KPI tier / pay
 * class, and the question is whether any table already stores them. The models
 * say no, but the model is not the database — see check-schema-drift.ts. So ask
 * the database, and ask it across EVERY table, not a hand-picked few: a probe
 * that only looks at four tables cannot find a column that lives in a fifth.
 * Opens a connection, SELECTs from information_schema, writes nothing.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/probe-pr-columns.ts
 */
import { Client } from 'pg';
import { env } from '@/env.js';

/** Substrings of the editor's fields — matched loosely so a differently-named column still surfaces. */
const WANTED = [
  'race',
  'place',
  'year',
  'exp',
  'kpi',
  'pay_class',
  'payclass',
  'class',
  'language',
  'tier',
  'age',
  'dob',
  'height',
  'weight',
  'attendance',
];

async function main() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'main'
      ORDER BY table_name, ordinal_position`,
  );

  const tables = [...new Set(rows.map((r) => r.table_name))];
  console.log(`main schema: ${tables.length} tables, ${rows.length} columns\n`);

  // Control: a column I KNOW exists must be found, or the instrument is broken.
  const control = rows.filter((r) => r.column_name === 'approve_status');
  console.log(
    `CONTROL approve_status -> ${control.map((r) => `main.${r.table_name}`).join(', ') || 'NOT FOUND (probe is broken)'}\n`,
  );

  console.log('--- every column matching an edited field, anywhere in main ---');
  for (const want of WANTED) {
    const hits = rows
      .filter((r) => r.column_name.includes(want))
      .map((r) => `main.${r.table_name}.${r.column_name}`);
    console.log(`${want.padEnd(12)} ${hits.length ? hits.join('\n             ') : 'NOT FOUND'}`);
  }

  console.log('\n--- tables whose name mentions pr / agency ---');
  for (const t of tables.filter((t) => /(^|_)pr(_|$)|agency/.test(t))) {
    const cols = rows.filter((r) => r.table_name === t).map((r) => r.column_name);
    console.log(`main.${t}: ${cols.join(', ')}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
