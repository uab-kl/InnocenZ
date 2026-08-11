/**
 * Move existing R2 objects into the NAMED folders, and repoint every database
 * reference at the new key.
 *
 *   agency/c30fcd15-…/logo/x.png      →  agency/atlas-agency-c30fcd15/logo/x.png
 *   outlet/31ffefb5-…/logo/x.png      →  outlet/emhub-testing-31ffefb5/logo/x.png
 *   user/agency/dato-…-96cb6034/y.png →  user/atlas-agency/finance/dato-…-96cb6034/y.png
 *
 * DRY RUN BY DEFAULT. Prints every planned move and every row it would touch,
 * and changes nothing. Pass --apply to execute.
 *
 *   pnpm tsx apps/backend/src/scripts/rename-r2-folders.ts
 *   pnpm tsx apps/backend/src/scripts/rename-r2-folders.ts --apply
 *
 * WHY THIS IS NOT SIMPLY A RENAME: R2 (like S3) has no rename. A key is fixed
 * when the object is written, so moving one is copy-to-new-key, verify, update
 * every reference, then delete the old. Each step can fail independently, so
 * the order here is deliberate:
 *
 *   copy → verify the copy exists → update the DB → delete the original
 *
 * An interrupted run therefore leaves a duplicate object, never a broken
 * reference: the DB still points at something that exists in both the old and
 * the new location. Re-running is safe and finishes the job. The reverse order
 * — delete first, or update the DB before the copy lands — would turn any
 * interruption into a missing photo, which for a proof-of-payment receipt is
 * evidence destroyed.
 *
 * TARGET KEYS COME FROM THE APP'S OWN FUNCTIONS (`orgFolder`,
 * `composeUserFolder` via `userFolder`), never re-implemented here. A migration
 * that computed folder names its own way would drift from what uploads produce
 * the moment either changed, and the bucket would end up with three
 * conventions instead of one.
 *
 * ⚠️ RUN THIS BEFORE RESTARTING THE BACKEND, NOT AFTER.
 *
 * Payment-voucher PDFs are the one asset whose key NO database column holds —
 * `voucherPdfKey()` recomputes it from `userFolder(prUserId)` on every request
 * (see payment-voucher-archive.ts: "The key is DETERMINISTIC"). So they need no
 * repointing, but they are order-sensitive in a way the stored refs are not:
 *
 *   migrate → restart   brief window where a running server still computes the
 *                       OLD key for a file already moved: a 404 on a PV PDF
 *                       download, closed by the restart.
 *   restart → migrate   the server computes the NEW key while the file is still
 *                       at the old one — the same 404, but it lasts until the
 *                       migration finishes rather than until a restart.
 *
 * Either way nothing is lost and no reference breaks permanently. Migrating
 * first keeps the window to seconds.
 *
 * Credentials are read from the environment at runtime, exactly as the server
 * reads them. Nothing is written to disk.
 */
import './_probe-env';

import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { env } from '@/env';
import { orgFolder } from '@/util/org-logo';
import { primeUserFolders, userFolder } from '@/util/user-folder';

const APPLY = process.argv.includes('--apply');
// Read through `env`, the same validated source `r2.ts` uses — reading
// process.env directly is how this script first looked for R2_BUCKET, which is
// not the name of anything.
const BUCKET = env.R2_BUCKET_NAME ?? '';

/**
 * Every column that can hold an object key.
 *
 * `kind: 'scalar'` is a varchar holding one key. `kind: 'array'` is a jsonb
 * array of keys — portfolio slots may contain nulls, which are real ("slot 3
 * is empty") and must survive the rewrite rather than be compacted away.
 */
const REF_COLUMNS: { table: string; column: string; kind: 'scalar' | 'array' }[] = [
  { table: 'agency', column: 'logo_image', kind: 'scalar' },
  { table: 'outlet', column: 'logo_image', kind: 'scalar' },
  { table: 'user', column: 'profile_image', kind: 'scalar' },
  { table: 'user_profile', column: 'comcard_image', kind: 'scalar' },
  { table: 'user_profile', column: 'id_photo_front', kind: 'scalar' },
  { table: 'user_profile', column: 'id_photo_back', kind: 'scalar' },
  { table: 'user_profile', column: 'portfolio_photos', kind: 'array' },
  { table: 'payment_voucher_receipt', column: 'proof_photos', kind: 'array' },
  { table: 'payment_voucher_line', column: 'proof_photos', kind: 'array' },
  { table: 'payment_voucher_dispute', column: 'proof_photos', kind: 'array' },
  { table: 'shift_assignment', column: 'leave_proof_photos', kind: 'array' },
];

function client(): S3Client {
  return new S3Client({
    // "auto" — R2 rejects a real region label, same as getClient() in r2.ts.
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
}

async function listAll(s3: S3Client, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

type OrgRow = { id: string; name: string | null };

/** node-postgres hands back { rows }; some drivers return the array itself. */
function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: unknown[] }).rows ?? []) as T[];
}

/** id → new folder segment, for both org kinds. */
async function orgFolders(kind: 'agency' | 'outlet'): Promise<Map<string, string>> {
  const rows = toRows<OrgRow>(await db.execute(sql.raw(`select id, name from main."${kind}"`)));
  return new Map(rows.map((r) => [r.id, orgFolder(r.id, r.name)]));
}

/**
 * Old key → new key, or null when it is already where it belongs.
 *
 * Matching is on the ID, never the name: that is the same rule `isOwnedUserKey`
 * uses, and it is what makes a re-run idempotent after someone is renamed.
 */
function planOrgKey(key: string, folders: Map<string, string>): string | null {
  const [kind, folder, ...rest] = key.split('/');
  if (!folder || rest.length === 0) return null;
  /*
   * THREE shapes can be in the bucket at once, and all must be recognised:
   *
   *   agency/<full-uuid>/…                    original
   *   agency/<slug>-<id8>/…                   the first naming pass
   *   agency/<slug>-<full-uuid>/…             current
   *
   * Matching only the first and the last is what left the already-renamed
   * logos out of an earlier plan: they were neither a bare uuid nor yet the
   * target, so they were written off as orphans and silently skipped.
   */
  const head = folder.replace(/-/g, '');
  for (const [id, target] of folders) {
    const id8 = id.replace(/-/g, '').slice(0, 8);
    const owns =
      folder === id ||
      folder === target ||
      folder.endsWith(`-${id}`) ||
      // `-<id8>` compared on the de-hyphenated tail so a slug ending in hex
      // cannot collide by accident.
      head.endsWith(id8);
    if (!owns) continue;
    if (folder === target) return null; // already correct
    return [kind, target, ...rest].join('/');
  }
  return null; // orphan — no org row owns it; left alone deliberately
}

function planUserKey(key: string, target: Map<string, string>): string | null {
  const rest = key.slice('user/'.length);
  for (const [userId, folder] of target) {
    const head = userId.replace(/-/g, '').slice(0, 8);
    const segs = rest.split('/');
    // Owner sits in segment 1, 2 or 3 — the three shapes that are live.
    const idx = segs.findIndex(
      (s, i) => i < 3 && (s === userId || s === head || s.endsWith(`-${head}`)),
    );
    if (idx === -1) continue;
    const tail = segs.slice(idx + 1).join('/');
    const next = `user/${folder}${tail ? `/${tail}` : ''}`;
    return next === key ? null : next;
  }
  return null;
}

async function copyThenVerify(s3: S3Client, from: string, to: string): Promise<void> {
  await s3.send(
    new CopyObjectCommand({ Bucket: BUCKET, CopySource: `${BUCKET}/${from}`, Key: to }),
  );
  // Prove it landed before anything points at it or the original is removed.
  await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: to }));
}

/** Repoint every reference. Returns how many rows changed, per column. */
async function repoint(moves: Map<string, string>): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [from, to] of moves) {
    for (const ref of REF_COLUMNS) {
      const label = `${ref.table}.${ref.column}`;
      const res =
        ref.kind === 'scalar'
          ? await db.execute(
              sql`update main.${sql.identifier(ref.table)} set ${sql.identifier(ref.column)} = ${to} where ${sql.identifier(ref.column)} = ${from}`,
            )
          : await db.execute(
              // Rebuild the array element-wise so nulls and ordering survive.
              sql`update main.${sql.identifier(ref.table)}
                     set ${sql.identifier(ref.column)} = (
                       select jsonb_agg(
                                case when value #>> '{}' = ${from} then to_jsonb(${to}::text) else value end
                                order by ord)
                         from jsonb_array_elements(${sql.identifier(ref.column)}) with ordinality as t(value, ord)
                     )
                   where ${sql.identifier(ref.column)} @> to_jsonb(ARRAY[${from}::text])`,
            );
      const n = (res as { rowCount?: number }).rowCount ?? 0;
      if (n) counts[label] = (counts[label] ?? 0) + n;
    }
  }
  return counts;
}

async function main() {
  if (!BUCKET) throw new Error('R2_BUCKET_NAME is not set — nothing to migrate against');
  console.log(`bucket: ${BUCKET}`);
  console.log(
    APPLY
      ? 'MODE: APPLY — objects and rows WILL change\n'
      : 'MODE: DRY RUN — nothing will change\n',
  );

  const s3 = client();
  await primeUserFolders();

  const moves = new Map<string, string>();

  for (const kind of ['agency', 'outlet'] as const) {
    const folders = await orgFolders(kind);
    for (const key of await listAll(s3, `${kind}/`)) {
      const next = planOrgKey(key, folders);
      if (next) moves.set(key, next);
    }
  }

  // Every user's target folder, straight from the primed cache.
  const ids = toRows<{ id: string }>(await db.execute(sql`select id from main."user"`));
  const userTargets = new Map(ids.map((r) => [r.id, userFolder(r.id)]));
  for (const key of await listAll(s3, 'user/')) {
    const next = planUserKey(key, userTargets);
    if (next) moves.set(key, next);
  }

  if (moves.size === 0) {
    console.log('Nothing to move — every object is already in its named folder.');
    return;
  }

  console.log(`${moves.size} object(s) to move:\n`);
  for (const [from, to] of moves) console.log(`  ${from}\n    -> ${to}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to perform the moves.');
    return;
  }

  let moved = 0;
  for (const [from, to] of moves) {
    await copyThenVerify(s3, from, to);
    moved++;
  }
  console.log(`\ncopied ${moved} object(s); updating references…`);

  const counts = await repoint(moves);
  for (const [label, n] of Object.entries(counts)) console.log(`  ${label}: ${n} row(s)`);

  // Originals are deleted LAST and only once every reference has moved.
  const { r2DeleteObject } = await import('@/util/r2');
  for (const from of moves.keys()) await r2DeleteObject(from);
  console.log(`deleted ${moves.size} original object(s). Done.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
