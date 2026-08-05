/**
 * One-shot probe: upload a tiny PNG to R2 and print the public URL.
 * Run from apps/backend:
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-r2-profile.ts
 */
import '@/load-env';
import { r2Configured, r2DeleteObject, r2PutObject, r2PublicUrl } from '@/util/r2';

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  console.log('r2Configured:', r2Configured());
  if (!r2Configured()) {
    console.error('Missing R2_* env — check repo-root .env');
    process.exit(1);
  }

  const key = `user/pr/_probe_test/profile-${Date.now()}.png`;
  const url = await r2PutObject({
    key,
    body: PNG,
    contentType: 'image/png',
  });
  console.log('uploaded:', url);
  console.log('expected public form:', r2PublicUrl(key));

  // leave the object so you can open the URL; pass --cleanup to remove
  if (process.argv.includes('--cleanup')) {
    await r2DeleteObject(key);
    console.log('cleaned up', key);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
