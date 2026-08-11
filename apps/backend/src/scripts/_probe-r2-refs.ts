/**
 * Read-only: does every stored image reference point at an object that exists?
 *
 * The migration's own re-run only proves the BUCKET converged. This proves the
 * other half — that nothing in the database still points at a key that was
 * moved out from under it. A dangling ref is the failure mode that matters:
 * the photo is intact, but the row can no longer find it.
 */
import './_probe-env';

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { env } from '@/env';

const COLS: { table: string; column: string; kind: 'scalar' | 'array' }[] = [
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

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

async function main() {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });

  const present = new Set<string>();
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: env.R2_BUCKET_NAME, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) if (o.Key) present.add(o.Key);
    token = page.NextContinuationToken;
  } while (token);
  console.log(`objects in bucket: ${present.size}`);

  let checked = 0;
  const dangling: string[] = [];
  for (const c of COLS) {
    const rows = toRows<{ ref: string | null }>(
      await db.execute(
        c.kind === 'scalar'
          ? sql`select ${sql.identifier(c.column)} as ref from main.${sql.identifier(c.table)} where ${sql.identifier(c.column)} is not null`
          : sql`select jsonb_array_elements_text(${sql.identifier(c.column)}) as ref from main.${sql.identifier(c.table)} where ${sql.identifier(c.column)} is not null`,
      ),
    );
    for (const r of rows) {
      const ref = r.ref?.trim();
      // Only R2 object keys are this script's business — /img/ paths, data URLs
      // and absolute URLs are served by something else entirely.
      if (!ref) continue;
      if (!/^(user|agency|outlet)\//.test(ref)) continue;
      checked++;
      if (!present.has(ref)) dangling.push(`${c.table}.${c.column} -> ${ref}`);
    }
  }

  console.log(`R2 refs checked: ${checked}`);
  if (dangling.length === 0) {
    console.log('OK — every stored reference resolves to an object that exists.');
  } else {
    console.log(`DANGLING (${dangling.length}):`);
    for (const d of dangling) console.log(`  ${d}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
