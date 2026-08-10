/**
 * Can this R2 token actually WRITE to the staging bucket, and which bucket does
 * R2_PUBLIC_URL serve? (write test cleans up after itself)
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-r2-staging.ts
 */
import '@/load-env';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '@/env';

const client = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
  },
});

async function probe(bucket: string) {
  console.log(`\n=== ${bucket} ===`);
  const key = `_probe/write-test-${Date.now()}.txt`;

  try {
    const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    console.log(`  LIST   ok (${list.KeyCount ?? 0} keys)`);
  } catch (e) {
    console.log(`  LIST   DENIED — ${(e as Error).name}: ${(e as Error).message}`);
  }

  let wrote = false;
  try {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'ok', ContentType: 'text/plain' }),
    );
    wrote = true;
    console.log(`  PUT    ok  (${key})`);
  } catch (e) {
    console.log(`  PUT    DENIED — ${(e as Error).name}: ${(e as Error).message}`);
  }

  if (wrote) {
    try {
      await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      console.log('  GET    ok');
    } catch (e) {
      console.log(`  GET    DENIED — ${(e as Error).name}`);
    }
    // The half that actually decides whether an uploaded photo DISPLAYS:
    // does R2_PUBLIC_URL serve THIS bucket?
    const publicUrl = `${String(env.R2_PUBLIC_URL).replace(/\/$/, '')}/${key}`;
    try {
      const res = await fetch(publicUrl);
      console.log(
        res.ok
          ? `  PUBLIC ok  — R2_PUBLIC_URL serves '${bucket}' (uploaded photos will display)`
          : `  PUBLIC HTTP ${res.status} — R2_PUBLIC_URL does NOT serve '${bucket}'; uploads succeed but images 404`,
      );
    } catch (e) {
      console.log(`  PUBLIC fetch failed — ${(e as Error).message}`);
    }
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log('  DELETE ok (probe object removed)');
    } catch (e) {
      console.log(`  DELETE DENIED — ${(e as Error).name} — LEFTOVER: ${key}`);
    }
  }
}

async function main() {
  console.log('R2_BUCKET_NAME in env :', env.R2_BUCKET_NAME);
  console.log('R2_PUBLIC_URL in env  :', env.R2_PUBLIC_URL);

  await probe('innocenz');
  await probe('innocenz-staging');

  // Which bucket does the public dev URL actually serve? This key exists only in `innocenz`.
  const known = 'user/97505f5b-30c5-44d9-9348-ca6cbdea730e/profile/avatar-1786101448547.jpg';
  const url = `${String(env.R2_PUBLIC_URL).replace(/\/$/, '')}/${known}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log(`\nR2_PUBLIC_URL + a key that exists ONLY in 'innocenz' -> HTTP ${res.status}`);
    console.log(res.ok ? "  => R2_PUBLIC_URL serves the 'innocenz' bucket" : '  => not served there');
  } catch (e) {
    console.log(`\npublic URL probe failed: ${(e as Error).message}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
