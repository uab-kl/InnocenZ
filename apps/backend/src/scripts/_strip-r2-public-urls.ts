/**
 * One-shot: rewrite stored full R2 public URLs → object keys only.
 * Safe to re-run (keys already stored are left alone).
 *
 *   pnpm --filter innocenz-backend exec tsx src/scripts/_strip-r2-public-urls.ts
 */
import '@/load-env';
import pg from 'pg';
import { env } from '@/env';

function stripToKey(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  if (value.startsWith('user/')) return value;
  if (value.startsWith(`${base}/`)) return value.slice(base.length + 1);
  return value;
}

async function main() {
  const base = env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!base) {
    console.error('R2_PUBLIC_URL is not set');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const users = await client.query<{
    id: string;
    profile_image: string | null;
    comcard_image: string | null;
    portfolio_photos: (string | null)[] | null;
  }>(`
    SELECT u.id, u.profile_image, p.comcard_image, p.portfolio_photos
    FROM main."user" u
    LEFT JOIN main.user_profile p ON p.user_id = u.id
  `);

  let updated = 0;
  for (const row of users.rows) {
    const nextProfile = stripToKey(row.profile_image, base);
    const nextComcard = stripToKey(row.comcard_image, base);
    const nextPortfolio = Array.isArray(row.portfolio_photos)
      ? row.portfolio_photos.map((p) => stripToKey(p, base))
      : row.portfolio_photos;

    const profileChanged = nextProfile !== row.profile_image;
    const comcardChanged = nextComcard !== row.comcard_image;
    const portfolioChanged =
      JSON.stringify(nextPortfolio) !== JSON.stringify(row.portfolio_photos);

    if (!profileChanged && !comcardChanged && !portfolioChanged) continue;

    if (profileChanged) {
      await client.query(`UPDATE main."user" SET profile_image = $2 WHERE id = $1`, [
        row.id,
        nextProfile,
      ]);
    }
    if (comcardChanged || portfolioChanged) {
      await client.query(
        `UPDATE main.user_profile
         SET comcard_image = COALESCE($2, comcard_image),
             portfolio_photos = COALESCE($3::jsonb, portfolio_photos)
         WHERE user_id = $1`,
        [
          row.id,
          comcardChanged ? nextComcard : null,
          portfolioChanged ? JSON.stringify(nextPortfolio) : null,
        ],
      );
    }
    updated += 1;
    console.log('stripped', row.id, {
      profile: profileChanged ? nextProfile : undefined,
      comcard: comcardChanged ? nextComcard : undefined,
      portfolio: portfolioChanged ? nextPortfolio : undefined,
    });
  }

  console.log(`Done. Updated ${updated} user(s).`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
