/**
 * Compares the LIVE database against the newest drizzle snapshot.
 *
 * This exists because nothing else does it. `tsc` types come from the drizzle
 * model, and `drizzle-kit generate` diffs the model against the snapshot —
 * neither ever opens a connection. So a table can silently disagree with the
 * code while both report green, which is exactly what happened twice:
 *
 *   - payment_voucher_dispute.component was live as `payment_voucher_component`
 *     (the voucher-LINE vocabulary) while 0051, the model and the snapshot all
 *     said `payment_voucher_dispute_component`. Every dispute for drinks, tips
 *     or others would have failed at runtime; only 'wages' worked, by accident
 *     of appearing in both enums. Fixed in 0063.
 *   - platform_config is missing six columns the model declares, so
 *     PATCH /platform-config writes to columns that do not exist.
 *
 * Run it after every migrate and in CI. Exits non-zero on drift so a build can
 * fail on it instead of someone finding it months later.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/check-schema-drift.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { env } from '@/env.js';

const META_DIR = path.join(process.cwd(), 'postgres', 'migrations', 'meta');

type SnapshotColumn = { name: string; type: string };
type SnapshotTable = { name: string; columns: Record<string, SnapshotColumn> };
type Snapshot = { tables: Record<string, SnapshotTable> };

/** Enum types are schema-qualified and quoted in snapshots but bare in pg. */
function normaliseType(value: string): string {
  return value.replace(/"/g, '').replace(/^main\./, '').toLowerCase();
}

function newestSnapshot(): { file: string; snapshot: Snapshot } {
  const file = fs
    .readdirSync(META_DIR)
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort()
    .pop();
  if (!file) throw new Error(`No snapshot found in ${META_DIR}`);
  return {
    file,
    snapshot: JSON.parse(fs.readFileSync(path.join(META_DIR, file), 'utf8')) as Snapshot,
  };
}

async function main() {
  const { file, snapshot } = newestSnapshot();
  console.log(`[drift] comparing live DB against ${file}`);

  const client = new Client({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
  });
  await client.connect();

  const live = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    data_type: string;
  }>(
    `select table_name, column_name, udt_name, data_type
       from information_schema.columns where table_schema = 'main'`,
  );
  await client.end();

  const byTable = new Map<string, Map<string, (typeof live.rows)[number]>>();
  for (const row of live.rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Map());
    byTable.get(row.table_name)?.set(row.column_name, row);
  }

  const problems: string[] = [];

  for (const table of Object.values(snapshot.tables)) {
    const liveColumns = byTable.get(table.name);
    if (!liveColumns) {
      problems.push(`TABLE MISSING in live DB: ${table.name}`);
      continue;
    }
    for (const column of Object.values(table.columns)) {
      const liveColumn = liveColumns.get(column.name);
      if (!liveColumn) {
        problems.push(`COLUMN MISSING in live DB: ${table.name}.${column.name}`);
        continue;
      }
      // Only enum columns are type-compared. Comparing every type would drown
      // the signal in spelling differences (varchar(255) vs character varying),
      // and a wrong enum is the failure mode that actually bit us.
      if (liveColumn.data_type === 'USER-DEFINED') {
        const want = normaliseType(column.type);
        const got = normaliseType(liveColumn.udt_name);
        if (want !== got) {
          problems.push(
            `ENUM MISMATCH: ${table.name}.${column.name} — snapshot says ${want}, live has ${got}`,
          );
        }
      }
    }
  }

  for (const problem of problems) console.log(`  ${problem}`);
  console.log(
    `[drift] ${Object.keys(snapshot.tables).length} tables checked · ${problems.length} problem(s)`,
  );

  if (problems.length > 0) {
    console.log('[drift] FAIL — the live database does not match the model.');
    process.exit(1);
  }
  console.log('[drift] OK');
  process.exit(0);
}

main().catch((error) => {
  console.error('[drift] could not run:', error instanceof Error ? error.message : error);
  process.exit(1);
});
