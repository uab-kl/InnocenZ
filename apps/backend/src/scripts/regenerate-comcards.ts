/**
 * Rebuild every SAVED comcard PNG with the current plate design.
 *
 * A saved comcard is a flat image: the name plate is baked into its pixels, so
 * changing `comcard-generate.ts` (or the web/phone CSS) does nothing for a PR
 * who has already saved one. Their card keeps the old opaque white sticker
 * while every PR without a saved comcard — whose collage is drawn live — gets
 * the new frosted plate. That split is the whole reason this script exists:
 * without it the same grid shows two different comcard designs side by side.
 *
 * Only rows that HAVE a comcard image are touched. A PR who never saved one is
 * already rendering the live collage and needs nothing.
 *
 * That makes this the MIRROR of `backfill-comcards.ts`, and the two must not be
 * confused for each other:
 *
 *   regenerate-comcards.ts  comcard_image IS NOT NULL  -> rebuild an existing card
 *   backfill-comcards.ts    comcard_image IS NULL      -> create the missing card
 *
 * Reaching for this one to give a PR their FIRST comcard is the mistake the split
 * exists to prevent: the `isNotNull` filter below skips exactly that population,
 * silently, and the run reports success having done nothing for them.
 *
 *   # report only (default) — lists who would be rebuilt, writes nothing
 *   npx tsx --tsconfig tsconfig.json src/scripts/regenerate-comcards.ts
 *
 *   # rebuild and store
 *   npx tsx --tsconfig tsconfig.json src/scripts/regenerate-comcards.ts --apply
 *
 *   # one account
 *   npx tsx --tsconfig tsconfig.json src/scripts/regenerate-comcards.ts --apply --user <uuid>
 */
import '@/load-env';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { UserTable } from '@/features/user/user.model';
import { generateAndStoreComcard } from '@/util/comcard-generate';
import { deleteComcardImageFile } from '@/util/comcard-image';
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
    console.error('R2 is not configured — nothing to read or write. Aborting.');
    process.exit(1);
  }

  /*
   * MUST run before any key is built. `userFolder()` is synchronous and reads
   * an in-memory cache that the SERVER fills at boot; a standalone script that
   * skips this gets the documented cache-miss fallback — the bare uuid — and
   * silently writes `user/<uuid>/comcard/…`, dropping the rebuilt image back
   * into the flat layout the bucket was migrated off. Nothing errors; the file
   * just lands in the wrong folder.
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
      comcardImage: UserProfileTable.comcardImage,
    })
    .from(UserProfileTable)
    .innerJoin(UserTable, eq(UserTable.id, UserProfileTable.userId))
    .where(
      ONLY_USER
        ? eq(UserProfileTable.userId, ONLY_USER)
        : isNotNull(UserProfileTable.comcardImage),
    );

  const withComcard = rows.filter((r) => Boolean(r.comcardImage));
  console.log(`profiles with a saved comcard: ${withComcard.length}\n`);

  let rebuilt = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of withComcard) {
    const slots = normalizePortfolioSlots(row.portfolioPhotos);
    const label = `${row.username} (${row.userId})`;

    // The generator builds the collage FROM these slots. With none of them
    // filled it would produce four empty panels and a plate — a worse comcard
    // than the one already saved, so leave the existing image alone.
    if (!slots.some(Boolean)) {
      console.log(`skip  ${label} — saved comcard but no portfolio photos to rebuild from`);
      skipped += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`would rebuild  ${label}`);
      rebuilt += 1;
      continue;
    }

    try {
      const previous = row.comcardImage;
      const storedKey = await generateAndStoreComcard({
        userId: row.userId,
        fullName: row.fullName,
        // Same precedence the controller uses, so a rebuild cannot silently
        // rename someone's comcard.
        displayName: row.username || row.fullName || 'PR',
        dob: row.dob,
        // Without this a rebuild re-bakes the stored DOB's age, which for an
        // NRIC holder can be a year off what the app shows — the exact drift
        // this script exists to repair.
        idNo: row.idNo,
        heightCm: row.heightCm,
        weightKg: row.weightKg,
        portfolioPhotos: slots,
      });

      await db
        .update(UserProfileTable)
        .set({ comcardImage: storedKey, updatedBy: 'regenerate-comcards' })
        .where(eq(UserProfileTable.userId, row.userId));

      // Only after the row points at the new object — delete first and a crash
      // in between leaves the profile referencing an image that is gone.
      if (previous && previous !== storedKey) {
        await deleteComcardImageFile(previous);
      }

      console.log(`rebuilt  ${label} -> ${storedKey}`);
      rebuilt += 1;
    } catch (error) {
      failed += 1;
      console.error(`FAILED   ${label}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(
    `\n${APPLY ? 'rebuilt' : 'would rebuild'}: ${rebuilt} | skipped: ${skipped} | failed: ${failed}` +
      (APPLY ? '' : '\nrun again with --apply to write'),
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
