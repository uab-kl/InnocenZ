/**
 * Give named PRs a profile picture and four portfolio tiles — rendered,
 * uploaded to R2, and written back to the database.
 *
 *   cd apps/backend
 *   npx tsx --tsconfig tsconfig.json src/scripts/seed-pr-portfolio.ts <userId> [<userId>…]           # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/seed-pr-portfolio.ts --apply <userId> [<userId>…]
 *
 * `seed-account-details.ts` already does this for the whole population, but it
 * fills BLANKS ONLY — deliberately, so it can never overwrite real data. That
 * makes it the wrong tool when the images a PR already has are WRONG, which is
 * how this script came to exist: Aisyah Sofea's gallery rendered "Muhammad
 * Haziq bin Iskandar" on every tile, and her R2 keys sat under
 * `user/pr/haziq-iskandar-<her uuid>/`. The folder is composed from the
 * USERNAME at the moment a key is written (`user-folder.ts`), so those files
 * were written before she was renamed and simply kept the old name. Nothing was
 * ever going to correct them on its own.
 *
 * Three things this deliberately does NOT do:
 *
 *  1. It does not delete the old objects. Once the rows below are rewritten
 *     nothing references them, but deleting from a shared bucket is not a seed
 *     script's decision; `rename-r2-folders.ts` is the tool that moves keys.
 *  2. It does not invent a face. The avatar is initials on a gradient and the
 *     tiles are numbered specimens, both marked as such — the same rule the
 *     account seeder follows, because a fabricated photograph of a real, named
 *     person is a different thing from placeholder art.
 *  3. It writes nothing without `--apply`. The dry run prints the exact keys.
 */
import { extname, join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/db/index';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { UserTable } from '@/features/user/user.model';
import { portfolioImageObjectKey } from '@/util/portfolio-image';
import { profileImageObjectKey } from '@/util/profile-image';
import { r2Configured, r2PutObject } from '@/util/r2';
import { primeUserFolders } from '@/util/user-folder';

const APPLY = process.argv.includes('--apply');

/**
 * `--from=<dir>` uploads REAL photographs instead of rendering placeholders.
 *
 * This is how the other 51 PRs got their galleries: one folder of pictures per
 * person under `C:/Users/jinkg/Pictures/prs`, uploaded by
 * `seed-why-we-met-prs.ts`. Nurul Aina and Aisyah Sofea have no folder there,
 * which is the whole reason they are the only two showing generated tiles.
 *
 * Photographs are NOT interchangeable between people. Every folder in that
 * library already belongs to a named PR, and attaching one of those faces to a
 * different name is the exact defect this script was written to repair. So the
 * pictures have to be supplied per person, deliberately, by their id.
 */
const FROM = process.argv.find((a) => a.startsWith('--from='))?.slice('--from='.length);

const PHOTO_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const USER_IDS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PORTFOLIO_SLOTS = 4;

if (USER_IDS.length === 0) {
  console.error('Give at least one user id. See the header for usage.');
  process.exit(1);
}

/** Deterministic per person, so a re-run produces the same colours. */
function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
function makeRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}
const intBetween = (rng: () => number, lo: number, hi: number) =>
  lo + Math.floor(rng() * (hi - lo + 1));

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Initials on a soft gradient — a stand-in headshot, never a fabricated face. */
async function buildAvatarPng(fullName: string, rng: () => number) {
  const initials = fullName
    .replace(/\b(bin|binti|a\/l|a\/p)\b/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const hue = intBetween(rng, 0, 359);
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue},52%,58%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 42) % 360},46%,34%)"/>
      </linearGradient></defs>
      <rect width="512" height="512" fill="url(#g)"/>
      <text x="256" y="256" text-anchor="middle" dominant-baseline="central"
        font-family="sans-serif" font-size="200" font-weight="700"
        fill="#ffffff" fill-opacity="0.92">${esc(initials || 'PR')}</text>
    </svg>`),
  )
    .png()
    .toBuffer();
}

/** A numbered portfolio tile in the 3:4 aspect the gallery renders. */
async function buildPortfolioPng(fullName: string, slot: number, rng: () => number) {
  const hue = intBetween(rng, 0, 359);
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stop-color="hsl(${hue},44%,46%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 28) % 360},38%,22%)"/>
      </linearGradient></defs>
      <rect width="600" height="800" fill="url(#g)"/>
      <circle cx="300" cy="300" r="120" fill="#ffffff" fill-opacity="0.16"/>
      <text x="300" y="640" text-anchor="middle" font-family="sans-serif"
        font-size="34" font-weight="700" fill="#ffffff" fill-opacity="0.9">${esc(fullName)}</text>
      <text x="300" y="690" text-anchor="middle" font-family="sans-serif"
        font-size="24" fill="#ffffff" fill-opacity="0.65">Portfolio ${slot} - specimen</text>
    </svg>`),
  )
    .png()
    .toBuffer();
}

/**
 * R2 returns sporadic 500 InternalErrors on these puts — a DIFFERENT one of the
 * five failed on each of three runs, while a 5-byte text put and single-image
 * puts to the same keys succeeded. That pattern is a flaky backend, not a bad
 * payload, and Cloudflare documents InternalError as retryable.
 *
 * The retry is local to this script on purpose: making the shared `r2PutObject`
 * retry would change the failure behaviour of every upload path in the product,
 * including the ones where a caller is waiting on a request.
 */
async function putWithRetry(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await r2PutObject(input);
    } catch (error) {
      lastError = error;
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      // Only a server-side fault is worth repeating. A 403 will never improve.
      if (!status || status < 500) throw error;
      console.log(`    retry ${attempt}/5 after ${status} on ${input.key}`);
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError;
}

// The folder cache decides the key prefix and is built from the CURRENT
// username — priming it first is what stops this writing under the stale name
// that caused the problem in the first place.
await primeUserFolders();

// Say what is wrong in one line. A missing folder here used to surface as a
// raw ENOENT stack trace, which reads like a broken script rather than "you
// have not put the photos there yet".
if (FROM && !existsSync(FROM)) {
  console.error(`No such folder: ${FROM}`);
  console.error('Create it and put the photos in, or drop --from to render placeholder tiles.');
  process.exit(1);
}

console.log(`R2 configured: ${r2Configured()}`);
if (!r2Configured() && APPLY) {
  console.error('R2 is not configured — nothing to upload to. Aborting.');
  process.exit(1);
}

for (const userId of USER_IDS) {
  const [user] = await db
    .select({
      id: UserTable.id,
      username: UserTable.username,
      memberCode: UserTable.memberCode,
      profileImage: UserTable.profileImage,
    })
    .from(UserTable)
    .where(eq(UserTable.id, userId));
  if (!user) {
    console.log(`\n${userId}: no such user — skipped`);
    continue;
  }
  const [profile] = await db
    .select({
      fullName: UserProfileTable.fullName,
      photos: UserProfileTable.portfolioPhotos,
    })
    .from(UserProfileTable)
    .where(eq(UserProfileTable.userId, userId));

  // The name ON THE TILES is the legal one when there is one — it is what an
  // agency reads on the comcard beside the photo.
  const fullName = profile?.fullName?.trim() || user.username;

  console.log(`\n${user.username}  ${user.memberCode}  (${fullName})`);
  console.log(`  was: ${user.profileImage ?? 'no avatar'}`);
  for (const old of (profile?.photos ?? []) as (string | null)[]) {
    if (old) console.log(`       ${old}`);
  }

  const avatarKey = profileImageObjectKey(userId, 'avatar.png');
  const portfolioKeys = Array.from({ length: PORTFOLIO_SLOTS }, (_, i) =>
    portfolioImageObjectKey(userId, `portfolio-${i + 1}.png`),
  );
  console.log(`  now: ${avatarKey}`);
  for (const key of portfolioKeys) console.log(`       ${key}`);

  const supplied = FROM
    ? readdirSync(FROM)
        .filter((f) => PHOTO_TYPES[extname(f).toLowerCase()])
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    : [];
  if (FROM) {
    console.log(`  source: ${FROM} — ${supplied.length} photo(s)`);
    if (supplied.length === 0) {
      console.log('  nothing usable in that folder — skipped');
      continue;
    }
  }

  if (!APPLY) continue;

  // With real photos the profile picture is the FIRST of them, by reference —
  // one image lives once in the bucket, exactly as seed-why-we-met-prs does it.
  const storedAvatar =
    supplied.length > 0
      ? portfolioImageObjectKey(userId, supplied[0].toLowerCase())
      : await putWithRetry({
          key: avatarKey,
          body: await buildAvatarPng(fullName, makeRng(seedFrom(`${userId}:avatar`))),
          contentType: 'image/png',
        });
  const storedPhotos: string[] = [];
  if (supplied.length > 0) {
    // Keep each file's own name and type — the gallery is the photographs, not
    // a re-encode of them, and `portfolio-1.png` on a JPEG would be a lie.
    for (const file of supplied) {
      const key = portfolioImageObjectKey(userId, file.toLowerCase());
      storedPhotos.push(
        await putWithRetry({
          key,
          body: readFileSync(join(FROM!, file)),
          contentType: PHOTO_TYPES[extname(file).toLowerCase()]!,
        }),
      );
    }
  } else {
    for (let slot = 1; slot <= PORTFOLIO_SLOTS; slot += 1) {
      storedPhotos.push(
        await putWithRetry({
          key: portfolioKeys[slot - 1],
          body: await buildPortfolioPng(
            fullName,
            slot,
            makeRng(seedFrom(`${userId}:portfolio:${slot}`)),
          ),
          contentType: 'image/png',
        }),
      );
    }
  }

  // Both writes or neither: an avatar pointing at the new folder while the
  // gallery still points at the old one is worse than leaving both alone.
  await db.transaction(async (tx) => {
    await tx
      .update(UserTable)
      .set({ profileImage: storedAvatar, updatedBy: 'seed-pr-portfolio' })
      .where(eq(UserTable.id, userId));
    await tx
      .update(UserProfileTable)
      .set({ portfolioPhotos: storedPhotos, updatedBy: 'seed-pr-portfolio' })
      .where(eq(UserProfileTable.userId, userId));
  });
  console.log(`  written: 1 avatar + ${storedPhotos.length} tiles, database updated`);
}

console.log(APPLY ? '\ndone.' : '\ndry run — add --apply to upload and write.');
process.exit(0);
