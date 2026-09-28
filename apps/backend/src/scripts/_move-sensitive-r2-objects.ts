/**
 * ONE-TIME MOVE — sensitive files out of the PUBLIC bucket (28 Sep 2026).
 *
 * ID-card photos, receipt / MC / dispute proof and signed voucher PDFs were
 * uploaded to the bucket whose public address serves every object to anyone
 * with the link. The app now signs those links and, once R2_PRIVATE_BUCKET_NAME
 * is set, reads and writes them in the private bucket (util/r2.ts). This moves
 * what is already there. Keys do not change, so no database row changes.
 *
 * Order — each step is safe to re-run:
 *   1. Create the private bucket in Cloudflare (public access OFF) and scope the
 *      R2 token to BOTH buckets.
 *   2. Dry run — counts only:
 *        R2_PRIVATE_BUCKET_NAME=<name> npx tsx --tsconfig tsconfig.json src/scripts/_move-sensitive-r2-objects.ts
 *   3. Copy:            … --copy
 *   4. Set R2_PRIVATE_BUCKET_NAME in the backend env and restart/deploy it.
 *   5. Copy again (catches anything uploaded between 3 and 4): … --copy
 *   6. Remove the public copies (each one only after its private copy is
 *      confirmed present):   … --delete-public
 *
 * Prints counts per folder only — never a key, never a name.
 */
import './_probe-env';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '@/env';
import { isSensitiveR2Key } from '@/util/r2';

const COPY = process.argv.includes('--copy');
const DELETE_PUBLIC = process.argv.includes('--delete-public');

function folderOf(key: string): string {
  return /\/(ic-docs|id-docs|receipts|leave|disputes|pv)\//.exec(key)?.[1] ?? 'other';
}

async function main() {
  const publicBucket = env.R2_BUCKET_NAME;
  const privateBucket = env.R2_PRIVATE_BUCKET_NAME;
  if (!publicBucket || !env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('R2_* is not configured');
  }
  if ((COPY || DELETE_PUBLIC) && !privateBucket) {
    throw new Error('Set R2_PRIVATE_BUCKET_NAME to the private bucket first');
  }
  if (privateBucket === publicBucket) {
    throw new Error('R2_PRIVATE_BUCKET_NAME must differ from R2_BUCKET_NAME');
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });

  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: publicBucket, Prefix: 'user/', ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) if (obj.Key && isSensitiveR2Key(obj.Key)) keys.push(obj.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const byFolder = new Map<string, number>();
  for (const key of keys) byFolder.set(folderOf(key), (byFolder.get(folderOf(key)) ?? 0) + 1);
  console.log(`sensitive objects still in the PUBLIC bucket: ${keys.length}`);
  for (const [folder, count] of byFolder) console.log(`  ${folder.padEnd(10)} ${count}`);

  const existsInPrivate = async (key: string) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: privateBucket!, Key: key }));
      return true;
    } catch {
      return false;
    }
  };

  if (COPY) {
    let copied = 0;
    let already = 0;
    for (const key of keys) {
      if (await existsInPrivate(key)) {
        already += 1;
        continue;
      }
      await s3.send(
        new CopyObjectCommand({
          Bucket: privateBucket!,
          Key: key,
          CopySource: `${publicBucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
        }),
      );
      copied += 1;
    }
    console.log(`copied ${copied}, already in the private bucket ${already}`);
  }

  if (DELETE_PUBLIC) {
    let deleted = 0;
    let kept = 0;
    for (const key of keys) {
      // Never delete a public copy whose private twin is not confirmed present.
      if (!(await existsInPrivate(key))) {
        kept += 1;
        continue;
      }
      await s3.send(new DeleteObjectCommand({ Bucket: publicBucket, Key: key }));
      deleted += 1;
    }
    console.log(`deleted ${deleted} public copies; kept ${kept} with no private copy yet (run --copy)`);
  }

  if (!COPY && !DELETE_PUBLIC) console.log('dry run — pass --copy, then --delete-public (see the header).');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String((e as Error).message ?? e).slice(0, 300));
    process.exit(1);
  });
