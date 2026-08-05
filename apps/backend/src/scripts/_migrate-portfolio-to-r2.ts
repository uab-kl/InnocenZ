/**
 * Copy local /img/users/portfolio/* paths up to R2 and rewrite portfolio_photos.
 * Refuses to wipe existing URLs if no local files were migrated.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_migrate-portfolio-to-r2.ts [userId]
 */
import fs from 'node:fs';
import path from 'node:path';
import '@/load-env';
import pg from 'pg';
import { r2Configured, r2PutObject } from '@/util/r2';
import { sanitizePathSegment } from '@/util/profile-image';

const USER_ID = process.argv[2] ?? '4003eadb-d067-4f60-af24-6910805f04f1';

const CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main() {
  if (!r2Configured()) {
    console.error('R2 not configured');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(
    `SELECT p.full_name, p.portfolio_photos
     FROM main.user_profile p
     WHERE p.user_id = $1`,
    [USER_ID],
  );
  if (!rows[0]) {
    console.error('No profile for', USER_ID);
    process.exit(1);
  }

  const fullName: string = rows[0].full_name ?? 'user';
  const raw = rows[0].portfolio_photos;
  const photos: (string | null)[] = Array.isArray(raw) ? raw : [];
  const next: (string | null)[] = photos.map((p) => p ?? null);
  let migrated = 0;

  for (let slot = 0; slot < Math.max(photos.length, 8); slot++) {
    const current = next[slot] ?? null;
    if (!current) {
      console.log(`slot ${slot}: empty`);
      continue;
    }
    if (/^https?:\/\//.test(current)) {
      console.log(`slot ${slot}: already R2`);
      continue;
    }
    if (!current.startsWith('/img/users/portfolio/')) {
      console.log(`slot ${slot}: skip unknown ${current}`);
      continue;
    }

    const localPath = path.join(process.cwd(), 'public', current.replace(/^\//, ''));
    if (!fs.existsSync(localPath)) {
      console.warn(`slot ${slot}: missing file ${localPath}`);
      continue;
    }

    const ext = path.extname(localPath).toLowerCase() || '.jpg';
    const key = `user/pr/${USER_ID}_${sanitizePathSegment(fullName)}/portfolio/slot-${slot}${ext}`;
    const url = await r2PutObject({
      key,
      body: fs.readFileSync(localPath),
      contentType: CONTENT_TYPE[ext] ?? 'image/jpeg',
    });
    next[slot] = url;
    migrated += 1;
    console.log(`slot ${slot}: ${url}`);
  }

  if (migrated === 0) {
    console.log('Nothing migrated — DB left unchanged');
    await client.end();
    process.exit(0);
  }

  await client.query(
    `UPDATE main.user_profile
     SET portfolio_photos = $2::jsonb, updated_at = now(), updated_by = 'migrate-portfolio-to-r2'
     WHERE user_id = $1`,
    [USER_ID, JSON.stringify(next)],
  );
  console.log(`DB updated (${migrated} slots)`);
  await client.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
