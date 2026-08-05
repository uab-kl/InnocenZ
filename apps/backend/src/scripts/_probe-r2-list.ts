/**
 * List objects in the R2 bucket (read-only).
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-r2-list.ts
 */
import '@/load-env';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { r2Configured } from '@/util/r2';

async function main() {
  console.log('r2Configured:', r2Configured());
  console.log('bucket:', env.R2_BUCKET_NAME);
  if (!r2Configured()) process.exit(1);

  const client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const out = await client.send(
    new ListObjectsV2Command({
      Bucket: env.R2_BUCKET_NAME!,
      MaxKeys: 50,
    }),
  );

  const items = out.Contents ?? [];
  console.log(`objects: ${items.length}${out.IsTruncated ? '+' : ''}`);
  for (const o of items) {
    console.log(`  ${o.Key}  (${o.Size} bytes)`);
  }
  if (items.length === 0) console.log('(bucket is empty)');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
