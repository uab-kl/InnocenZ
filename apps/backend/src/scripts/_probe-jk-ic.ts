/**
 * Repoint jk back at the REAL IC photographs.
 *
 * `--regenerate-cards` replaced the stored key with a generated MyKad specimen.
 * The originals survived in R2 only because a genuine upload carries a timestamp
 * in its filename (`id-front-1786335596728.jpeg`) while this project's generated
 * cards are always `id-front.png` — so nothing was destroyed, but the row must
 * point at the photograph, not the drawing.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-jk-ic.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-jk-ic.ts --apply
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { r2ListKeys } from '@/util/r2';

const USER_ID = '4eb70d95-a40a-4039-8caa-9411b1895684';
const APPLY = process.argv.includes('--apply');

const keys = await r2ListKeys(`user/pr/jk-${USER_ID}/ic-docs/`);

/**
 * Plain string tests, no regex. The first attempt built the pattern inside a
 * template literal written through a shell heredoc, which ate one backslash and
 * turned `\d+` into `d+` — so it matched nothing and reported the real scans as
 * missing. A check that can silently become a different check is worse than a
 * clumsier one that cannot.
 */
const realScan = (side: 'front' | 'back'): string | null => {
  const prefix = `id-${side}-`;
  const generated = `id-${side}.png`;
  for (const key of keys) {
    const name = key.slice(key.lastIndexOf('/') + 1);
    if (name === generated) continue;
    if (name.startsWith(prefix)) return key;
  }
  return null;
};

const front = realScan('front');
const back = realScan('back');
console.log('real front:', front ?? '(none)');
console.log('real back :', back ?? '(none)');

if (!front && !back) {
  console.log('\nNo genuine upload found — leaving the row alone.');
  process.exit(1);
}
if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to repoint the row.');
  process.exit(0);
}

await db
  .update(UserProfileTable)
  .set({
    ...(front ? { idPhotoFront: front } : {}),
    ...(back ? { idPhotoBack: back } : {}),
    updatedBy: 'restore-real-ic',
    updatedAt: new Date(),
  })
  .where(eq(UserProfileTable.userId, USER_ID));
console.log('\nRepointed jk at the real scans.');
process.exit(0);
