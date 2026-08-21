/**
 * Compares the LIVE database against the drizzle MODELS.
 *
 * This exists because nothing else does it. `tsc` types come from the drizzle
 * model, and `drizzle-kit generate` diffs the model against a snapshot —
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
 * ⚠️ It used to compare against the newest drizzle SNAPSHOT, and that made it
 * worse than useless. Snapshots stopped at 0070 because the migration journal
 * is corrupt and `drizzle-kit generate` cannot run, while hand-authored
 * migrations carried on to 0130. So it was judging a 2026-era database against
 * a 60-migration-old picture and reporting five FALSE problems every single
 * run — `pr` (dropped on purpose in 0095), `agency_user.sub_role` and
 * `outlet_user.sub_role` (dropped in 0107), `outlet_penalty_rule` (moved to
 * agency scope in 0113) and `agency_pr.pr_id`. A check that always fails is a
 * check everyone learns to ignore, and it was also BLIND to real drift in
 * everything added after 0070.
 *
 * The models are the thing the running code actually reads, so they are the
 * honest reference and they cannot go stale.
 *
 * Run it after every migrate and in CI. Exits non-zero on drift so a build can
 * fail on it instead of someone finding it months later.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/check-schema-drift.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import { env } from '@/env.js';

const FEATURES_DIR = path.join(process.cwd(), 'src', 'features');

/** Enum types are schema-qualified and quoted in some places but bare in pg. */
function normaliseType(value: string): string {
  return value
    .replace(/"/g, '')
    .replace(/^main\./, '')
    .toLowerCase();
}

/** Every `*.model.ts` under src/features — the same glob drizzle.config.ts uses. */
function modelFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...modelFiles(full));
    else if (entry.name.endsWith('.model.ts')) out.push(full);
  }
  return out;
}

type ModelTable = {
  name: string;
  columns: { name: string; sqlType: string; isEnum: boolean }[];
};

/**
 * Load every model and pull its table shape.
 *
 * Import errors are NOT swallowed: a model that fails to load would otherwise
 * vanish from the comparison and turn this into another green-signal-that-lies.
 */
async function modelTables(): Promise<ModelTable[]> {
  const files = modelFiles(FEATURES_DIR);
  if (files.length === 0)
    throw new Error(`No *.model.ts found under ${FEATURES_DIR}`);

  const tables: ModelTable[] = [];
  for (const file of files) {
    const mod: Record<string, unknown> = await import(pathToFileURL(file).href);
    for (const value of Object.values(mod)) {
      if (!is(value, PgTable)) continue;
      const cfg = getTableConfig(value);
      tables.push({
        name: cfg.name,
        columns: cfg.columns.map((column) => ({
          name: column.name,
          sqlType: column.getSQLType(),
          isEnum: Array.isArray(
            (column as { enumValues?: string[] }).enumValues,
          ),
        })),
      });
    }
  }
  return tables;
}

async function main() {
  const tables = await modelTables();
  console.log(
    `[drift] comparing live DB against ${tables.length} drizzle models`,
  );

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

  for (const table of tables) {
    const liveColumns = byTable.get(table.name);
    if (!liveColumns) {
      problems.push(`TABLE MISSING in live DB: ${table.name}`);
      continue;
    }
    for (const column of table.columns) {
      const liveColumn = liveColumns.get(column.name);
      if (!liveColumn) {
        problems.push(
          `COLUMN MISSING in live DB: ${table.name}.${column.name}`,
        );
        continue;
      }
      // Only enum columns are type-compared. Comparing every type would drown
      // the signal in spelling differences (varchar(255) vs character varying),
      // and a wrong enum is the failure mode that actually bit us.
      if (column.isEnum && liveColumn.data_type === 'USER-DEFINED') {
        const want = normaliseType(column.sqlType);
        const got = normaliseType(liveColumn.udt_name);
        if (want !== got) {
          problems.push(
            `ENUM MISMATCH: ${table.name}.${column.name} — model says ${want}, live has ${got}`,
          );
        }
      }
    }
  }

  // Reported, never failed on: a live table the models no longer mention is
  // usually a dropped feature's leftovers, not a break in the running code.
  const modelled = new Set(tables.map((t) => t.name));
  const orphans = [...byTable.keys()]
    .filter((name) => !modelled.has(name))
    .sort();

  for (const problem of problems) console.log(`  ${problem}`);
  if (orphans.length > 0) {
    console.log(
      `[drift] note — ${orphans.length} live table(s) no model declares: ${orphans.join(', ')}`,
    );
  }
  console.log(
    `[drift] ${tables.length} tables checked · ${problems.length} problem(s)`,
  );

  if (problems.length > 0) {
    console.log('[drift] FAIL — the live database does not match the model.');
    process.exit(1);
  }
  console.log('[drift] OK');
  process.exit(0);
}

main().catch((error) => {
  console.error(
    '[drift] could not run:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
