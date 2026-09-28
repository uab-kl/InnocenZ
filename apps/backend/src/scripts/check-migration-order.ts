/**
 * FAILS `migrate:deploy` BEFORE drizzle can silently skip a migration.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/check-migration-order.ts
 *
 * Runs first in the backend's `migrate:deploy` script. READ-ONLY: it reads the
 * journal and the `created_at` column of drizzle's ledger, nothing else, and
 * exits 1 — naming each migration and the smallest safe `when` — whenever an
 * unapplied journal entry is stamped at or before the newest ledger row. See
 * migration-order.ts for why the stamp, not the hash, is the identity.
 *
 * Connects with DATABASE_URL, the same URL `drizzle-kit migrate` uses, so it
 * judges the database that is about to be migrated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  type JournalEntry,
  migrationsThatWillRun,
  migrationsThatWouldBeSkipped,
  nextSafeWhen,
} from './migration-order';

const here = path.dirname(fileURLToPath(import.meta.url));
const journalPath = path.resolve(here, '../../postgres/migrations/meta/_journal.json');

async function readLedger(url: string): Promise<number[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin read only');
    const result = await client.query<{ created_at: string }>(
      'select created_at::text as created_at from drizzle.__drizzle_migrations',
    );
    await client.query('commit');
    return result.rows.map((row) => Number(row.created_at));
  } catch (error) {
    // A database that has never been migrated has no ledger, and nothing in it
    // can be skipped. Anything else is a real failure and stops the deploy.
    if ((error as { code?: string }).code === '42P01' || (error as { code?: string }).code === '3F000') {
      return [];
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migration-order] DATABASE_URL is not set — cannot check the ledger.');
    process.exit(1);
  }
  const journal = (JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries: JournalEntry[] })
    .entries;
  const ledger = await readLedger(url);

  const skipped = migrationsThatWouldBeSkipped(journal, ledger);
  const willRun = migrationsThatWillRun(journal, ledger);
  if (skipped.length > 0) {
    const newest = new Date(Math.max(...ledger)).toISOString();
    const safe = nextSafeWhen(journal, ledger);
    console.error(
      `[migration-order] ✗ ${skipped.length} migration(s) would be SILENTLY SKIPPED — drizzle only ` +
        `runs entries stamped after the newest ledger row (${newest}):`,
    );
    for (const e of skipped) {
      console.error(`   ${e.tag}  when=${e.when} (${new Date(e.when).toISOString()})`);
    }
    console.error(
      `   Fix: in postgres/migrations/meta/_journal.json give each one a \`when\` of at least ${safe} ` +
        `(${new Date(safe).toISOString()}), still increasing in journal order, then re-run.`,
    );
    process.exit(1);
  }
  console.log(
    `[migration-order] ✓ nothing would be skipped · ${willRun.length} pending: ` +
      (willRun.map((e) => e.tag).join(', ') || 'none') +
      ` · next new migration needs when ≥ ${nextSafeWhen(journal, ledger)}`,
  );
}

main().catch((error) => {
  console.error('[migration-order] check failed:', (error as Error).message);
  process.exit(1);
});
