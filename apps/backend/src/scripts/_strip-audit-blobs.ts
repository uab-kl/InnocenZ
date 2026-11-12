/**
 * ONE-TIME CLEAN-UP — embedded files copied into `audit_logs` (12 Nov 2026).
 *
 * Receipt, proof and MC photos used to travel as base64 `data:` URLs, and the
 * audit insert copied each one out of the request or response body: 250 rows
 * held about 112 MB of a 150 MB database (152 successful writes up to 10 Aug,
 * when photos moved to R2; 98 refused writes up to 8 Sep, which stored their
 * whole request body). The source tables hold R2 keys now, so these copies are
 * the only photos still inside Postgres — outside the signed-link and delete
 * rules that guard the originals.
 *
 * `stripAuditBlobs` now drops them on every NEW write. This applies the very
 * same function to the rows already there, so the clean-up and the live rule
 * cannot disagree about what counts as an embedded file. Only `data:` strings
 * change, each to `[omitted: <n> bytes]`; long strings that are not files
 * (signature stroke JSON) and every other field of every row stay as recorded.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_strip-audit-blobs.ts          # dry run: counts only
 *   npx tsx --tsconfig tsconfig.json src/scripts/_strip-audit-blobs.ts --apply  # write (owner's call)
 *
 * ⚠️ `--apply` REWRITES AUDIT HISTORY, so it is the owner's to run, not a
 * session's. It writes every change in ONE transaction: all rows or none.
 *
 * ⚠️ The space is NOT returned by the rewrite alone. The old TOAST chunks stay
 * allocated until `VACUUM FULL main.audit_logs` — which takes an EXCLUSIVE lock,
 * so every audited write waits while it runs. Run it off-hours.
 *
 * The dry run reads inside a READ ONLY transaction, so it cannot write even by
 * mistake. Prints counts, sizes and key NAMES only — never a value. Re-running
 * is a no-op: a stripped value strips to itself.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { stripAuditBlobs } from '@/features/audit-log/audit-log.repository';

const APPLY = process.argv.includes('--apply');
/** Small on purpose: one row can carry 2 MB of base64. */
const BATCH = 25;
const ACTOR = 'strip-audit-blobs-2026-11-12';

type Row = {
  audit_log_id: number;
  entity: string;
  action: string;
  created_at: string | Date;
  stored_bytes: number | string | null;
  old_data: unknown;
  new_data: unknown;
};

type Executor = Pick<typeof db, 'execute'>;

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

type Tally = { blobs: number; bytes: number };

/**
 * Every string the stripper replaced, tallied by `column.topKey` — names and
 * byte counts, never the string. The stripper alone decides what is a file;
 * this only measures what it decided.
 */
function measure(
  before: unknown,
  after: unknown,
  label: string,
  byKey: Map<string, Tally>,
  total: Tally,
): void {
  if (typeof before === 'string') {
    if (before !== after) {
      const bytes = Buffer.byteLength(before, 'utf8');
      const t = byKey.get(label) ?? { blobs: 0, bytes: 0 };
      t.blobs += 1;
      t.bytes += bytes;
      byKey.set(label, t);
      total.blobs += 1;
      total.bytes += bytes;
    }
    return;
  }
  if (typeof before !== 'object' || before === null || typeof after !== 'object' || after === null) {
    return;
  }
  for (const [key, value] of Object.entries(before as Record<string, unknown>)) {
    // The label stops at the first key under the column: `new_data.requestBody`
    // says WHICH lane copied the file, which is what the counts are for.
    const next = label.includes('.') || Array.isArray(before) ? label : `${label}.${key}`;
    measure(value, (after as Record<string, unknown>)[key], next, byKey, total);
  }
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function scan(exec: Executor) {
  const byKey = new Map<string, Tally>();
  const byEntity = new Map<string, number>();
  const byAction = new Map<string, number>();
  const total: Tally = { blobs: 0, bytes: 0 };
  const updates: { id: number; oldData: unknown; newData: unknown }[] = [];
  let scanned = 0;
  let storedBytes = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  let lastId = 0;

  for (;;) {
    // Pre-filtered to rows whose JSON text holds a string beginning `data:`
    // (`"data:` — a key named `data` reads `"data":`, so it does not match),
    // OR a key ending in `base64` with a string value — the raw sign-up logos
    // (review, 12 Nov 2026). `stripAuditBlobs` makes the actual decision on each.
    const rows = toRows<Row>(
      await exec.execute(sql`
        select audit_log_id, entity, action, created_at,
               coalesce(pg_column_size(old_data), 0) + coalesce(pg_column_size(new_data), 0) as stored_bytes,
               old_data, new_data
          from main.audit_logs
         where audit_log_id > ${lastId}
           and ((coalesce(old_data::text, '') || coalesce(new_data::text, '')) ilike '%"data:%'
             or (coalesce(old_data::text, '') || coalesce(new_data::text, '')) ~* '"[a-z_]*base64"\\s*:\\s*"')
         order by audit_log_id
         limit ${BATCH}`),
    );
    if (rows.length === 0) break;
    lastId = Number(rows[rows.length - 1].audit_log_id);
    scanned += rows.length;

    for (const row of rows) {
      const oldData = stripAuditBlobs(row.old_data);
      const newData = stripAuditBlobs(row.new_data);
      const changed =
        JSON.stringify(oldData) !== JSON.stringify(row.old_data) ||
        JSON.stringify(newData) !== JSON.stringify(row.new_data);
      if (!changed) continue;

      measure(row.old_data, oldData, 'old_data', byKey, total);
      measure(row.new_data, newData, 'new_data', byKey, total);
      bump(byEntity, row.entity);
      bump(byAction, row.action);
      storedBytes += Number(row.stored_bytes ?? 0);
      const at = new Date(row.created_at).toISOString().slice(0, 10);
      if (!firstAt || at < firstAt) firstAt = at;
      if (!lastAt || at > lastAt) lastAt = at;
      updates.push({ id: Number(row.audit_log_id), oldData, newData });
    }
  }

  return { scanned, updates, byKey, byEntity, byAction, total, storedBytes, firstAt, lastAt };
}

async function main() {
  let result: Awaited<ReturnType<typeof scan>>;
  if (APPLY) {
    result = await scan(db);
  } else {
    // READ ONLY: the dry run is incapable of a write, not merely careful.
    result = await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      return scan(tx);
    });
  }

  // The instrument check: what a plain text search counts, beside what the
  // stripper found. Two different numbers mean one of them is wrong.
  const [plain] = toRows<{ n: number }>(
    await db.execute(sql`
      select count(*)::int as n from main.audit_logs
       where new_data::text ilike '%data:image%' or old_data::text ilike '%data:image%'`),
  );

  let written = 0;
  if (APPLY && result.updates.length > 0) {
    // ONE transaction for the whole rewrite: every row is cleaned, or none is.
    await db.transaction(async (tx) => {
      for (const u of result.updates) {
        await tx.execute(sql`
          update main.audit_logs
             set old_data = ${u.oldData === null || u.oldData === undefined ? null : JSON.stringify(u.oldData)}::jsonb,
                 new_data = ${u.newData === null || u.newData === undefined ? null : JSON.stringify(u.newData)}::jsonb,
                 updated_at = now(),
                 updated_by = ${ACTOR}
           where audit_log_id = ${u.id}`);
      }
    });
    written = result.updates.length;
  }

  console.log(`mode: ${APPLY ? 'APPLY' : 'dry run, READ ONLY (pass --apply to write)'}`);
  console.log(`rows holding a '"data:' string (SQL pre-filter):   ${result.scanned}`);
  console.log(`rows mentioning 'data:image' (plain text search):   ${plain?.n ?? '?'}`);
  console.log(`rows the stripper would change:                     ${result.updates.length}`);
  console.log(`embedded files in them:                             ${result.total.blobs} (${mb(result.total.bytes)} of text)`);
  console.log(`those rows' old_data + new_data as stored now:      ${mb(result.storedBytes)}`);
  if (result.firstAt) console.log(`written between:                                    ${result.firstAt} and ${result.lastAt}`);
  if (APPLY) console.log(`rows rewritten (one transaction):                   ${written}`);
  console.log('by entity:');
  for (const [k, n] of [...result.byEntity].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${n}`);
  console.log('by action:');
  for (const [k, n] of [...result.byAction].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${n}`);
  console.log('by column.key (rows can count under several):');
  for (const [k, t] of [...result.byKey].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${k.padEnd(28)} ${String(t.blobs).padStart(5)} file(s)  ${mb(t.bytes)}`);
  }
  if (APPLY && written > 0) {
    console.log('NEXT: the space comes back only after `VACUUM FULL main.audit_logs` — an EXCLUSIVE lock; run it off-hours.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 500));
    process.exit(1);
  });
