/**
 * Generate a comcard PNG for every PR who does NOT have one yet.
 *
 * A comcard is only ever written when something re-renders it: the PR's own
 * app (`POST /user/:id/comcard/generate`), a PR profile save, or an agency
 * edit that moves a printed field. A PR who was seeded, or who has no login and
 * whose height/weight/name nobody has touched, therefore has NO object under
 * `user/pr/<slug>-<id8>/comcard/` at all — and since R2 has no real directories,
 * no folder either. Their tile is drawn live from the portfolio photos instead,
 * which works but renders a different plate design than a saved card does.
 *
 * This script closes that gap once. It is the MIRROR of `regenerate-comcards.ts`
 * and deliberately does not overlap with it:
 *
 *   backfill-comcards.ts    comcard_image IS NULL      -> create the missing card
 *   regenerate-comcards.ts  comcard_image IS NOT NULL  -> rebuild an existing one
 *
 * A PR with no portfolio photos is REPORTED, not generated: the collage is built
 * from those photos, so with none of them filled the output is four empty panels
 * under a name plate — worse than the empty state the UI already handles.
 *
 *   # report only (default) — lists who would be generated, writes nothing
 *   npx tsx --tsconfig tsconfig.json src/scripts/backfill-comcards.ts
 *
 *   # generate and store
 *   npx tsx --tsconfig tsconfig.json src/scripts/backfill-comcards.ts --apply
 *
 *   # one account
 *   npx tsx --tsconfig tsconfig.json src/scripts/backfill-comcards.ts --apply --user <uuid>
 */
import '@/load-env';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { UserTable } from '@/features/user/user.model';
import { generateAndStoreComcard } from '@/util/comcard-generate';
import { normalizePortfolioSlots } from '@/util/portfolio-image';
import { r2Configured } from '@/util/r2';
import { primeUserFolders } from '@/util/user-folder';

const APPLY = process.argv.includes('--apply');
const userArgIndex = process.argv.indexOf('--user');
const ONLY_USER = userArgIndex >= 0 ? process.argv[userArgIndex + 1] : null;

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY (will write)' : 'report only'}`);
  if (ONLY_USER) console.log(`user filter: ${ONLY_USER}`);

  if (!r2Configured()) {
    console.error('R2 is not configured — nothing to write. Aborting.');
    process.exit(1);
  }

  /*
   * MUST run before any key is built. `userFolder()` is synchronous and reads
   * an in-memory cache that the SERVER fills at boot; a standalone script that
   * skips this gets the documented cache-miss fallback — the bare uuid — and
   * silently writes `user/<uuid>/comcard/…`, dropping a brand-new card into the
   * flat layout the bucket was migrated off. Nothing errors; the file just
   * lands in a folder no reader looks in.
   */
  await primeUserFolders();

  const rows = await db
    .select({
      userId: UserProfileTable.userId,
      fullName: UserProfileTable.fullName,
      username: UserTable.username,
      dob: UserProfileTable.dob,
      idNo: UserProfileTable.idNo,
      heightCm: UserProfileTable.comcardHeightCm,
      weightKg: UserProfileTable.comcardWeightKg,
      portfolioPhotos: UserProfileTable.portfolioPhotos,
    })
    .from(UserProfileTable)
    .innerJoin(UserTable, eq(UserTable.id, UserProfileTable.userId))
    .where(
      ONLY_USER
        ? and(eq(UserProfileTable.userId, ONLY_USER), isNull(UserProfileTable.comcardImage))
        : isNull(UserProfileTable.comcardImage),
    );

  console.log(`profiles with no saved comcard: ${rows.length}\n`);

  let generated = 0;
  let failed = 0;
  /* Reported separately from failures: nothing went wrong, there is simply no
   * source material. These are the accounts the caller has to act on by hand. */
  const noPhotos: string[] = [];

  for (const row of rows) {
    const slots = normalizePortfolioSlots(row.portfolioPhotos);
    const label = `${row.username} (${row.userId})`;

    if (!slots.some(Boolean)) {
      console.log(`skip  ${label} — no portfolio photos, nothing to build a collage from`);
      noPhotos.push(label);
      continue;
    }

    if (!APPLY) {
      console.log(`would generate  ${label}`);
      generated += 1;
      continue;
    }

    try {
      const storedKey = await generateAndStoreComcard({
        userId: row.userId,
        // Same precedence every other caller uses, so a backfilled card cannot
        // print a different name than the one the portal shows.
        fullName: row.fullName,
        displayName: row.username || row.fullName || 'PR',
        dob: row.dob,
        // Age follows the IC wherever it is shown; passing `dob` alone can be a
        // year out for an NRIC holder.
        idNo: row.idNo,
        heightCm: row.heightCm,
        weightKg: row.weightKg,
        portfolioPhotos: slots,
      });

      /* There was no previous image by definition (the query filtered on NULL),
       * so nothing to delete here — the generator's own prune already cleared
       * any orphan left under the prefix by a failed earlier attempt. */
      await db
        .update(UserProfileTable)
        .set({ comcardImage: storedKey, updatedBy: 'backfill-comcards' })
        .where(eq(UserProfileTable.userId, row.userId));

      console.log(`generated  ${label} -> ${storedKey}`);
      generated += 1;
    } catch (error) {
      failed += 1;
      console.error(`FAILED     ${label}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(
    `\n${APPLY ? 'generated' : 'would generate'}: ${generated} | ` +
      `no photos: ${noPhotos.length} | failed: ${failed}`,
  );
  if (noPhotos.length > 0) {
    console.log(
      '\nStill without a comcard (upload portfolio photos first, then re-run):\n  ' +
        noPhotos.join('\n  '),
    );
  }
  if (!APPLY) console.log('\nrun again with --apply to write');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
