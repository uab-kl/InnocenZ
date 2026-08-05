/**
 * Find portfolio slots (and comcards) whose stored image no longer exists and
 * optionally null them out.
 *
 * Migration 0089-era `updateProfile` compared portfolio slots index by index and
 * deleted the old file whenever an index changed, so every drag-swap wiped both
 * sides of the swap from R2 while keeping the reordered paths in the DB. Those
 * rows now point at objects that are gone; the app renders them as broken tiles.
 *
 *   # report only (default)
 *   npx tsx --tsconfig tsconfig.json src/scripts/fix-dangling-portfolio-slots.ts
 *
 *   # null the dangling slots
 *   npx tsx --tsconfig tsconfig.json src/scripts/fix-dangling-portfolio-slots.ts --fix
 *
 *   # limit to one account
 *   npx tsx --tsconfig tsconfig.json src/scripts/fix-dangling-portfolio-slots.ts --user <uuid>
 */
import '@/load-env';
import fs from 'node:fs';
import path from 'node:path';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { env } from '@/env';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { normalizePortfolioSlots, PORTFOLIO_SLOT_COUNT } from '@/util/portfolio-image';
import { r2Configured, r2KeyFromStoredRef } from '@/util/r2';

const FIX = process.argv.includes('--fix');
const userArgIndex = process.argv.indexOf('--user');
const ONLY_USER = userArgIndex >= 0 ? process.argv[userArgIndex + 1] : null;

let client: S3Client | null = null;
function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

/** Cache by ref — the same key often repeats across slots after a bad swap. */
const existsCache = new Map<string, boolean>();

async function refExists(ref: string): Promise<boolean> {
  const cached = existsCache.get(ref);
  if (cached !== undefined) return cached;

  const exists = await probe(ref);
  existsCache.set(ref, exists);
  return exists;
}

async function probe(ref: string): Promise<boolean> {
  const key = r2KeyFromStoredRef(ref);
  if (key) {
    if (!r2Configured()) {
      // Can't verify without credentials — never destroy what we can't check.
      return true;
    }
    try {
      await r2().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME!, Key: key }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      if (status === 404 || status === 403) return false;
      throw error;
    }
  }

  if (ref.startsWith('/img/')) {
    return fs.existsSync(path.join(process.cwd(), 'public', ref.replace(/^\//, '')));
  }

  if (/^https?:\/\//.test(ref)) {
    try {
      const res = await fetch(ref, { method: 'HEAD' });
      return res.ok;
    } catch {
      return true; // Network hiccup — treat as present, don't clear it.
    }
  }

  return true;
}

async function main() {
  console.log(`mode: ${FIX ? 'FIX (will write)' : 'report only'}`);
  console.log(`r2Configured: ${r2Configured()}`);
  if (ONLY_USER) console.log(`user filter: ${ONLY_USER}`);

  const profiles = await (ONLY_USER
    ? db.select().from(UserProfileTable).where(eq(UserProfileTable.userId, ONLY_USER))
    : db.select().from(UserProfileTable));

  console.log(`profiles: ${profiles.length}\n`);

  let danglingSlots = 0;
  let danglingComcards = 0;
  let rowsChanged = 0;

  for (const profile of profiles) {
    const slots = normalizePortfolioSlots(profile.portfolioPhotos);
    const next = [...slots];
    const broken: number[] = [];

    for (let i = 0; i < PORTFOLIO_SLOT_COUNT; i++) {
      const ref = slots[i];
      if (!ref) continue;
      if (await refExists(ref)) continue;
      broken.push(i);
      next[i] = null;
    }

    const comcard = profile.comcardImage;
    const comcardBroken = Boolean(comcard) && !(await refExists(comcard!));

    if (broken.length === 0 && !comcardBroken) continue;

    danglingSlots += broken.length;
    if (comcardBroken) danglingComcards += 1;

    console.log(`user ${profile.userId} (${profile.fullName ?? 'no name'})`);
    for (const i of broken) console.log(`  slot ${i}: ${slots[i]}`);
    if (comcardBroken) console.log(`  comcard: ${comcard}`);

    if (!FIX) continue;

    await db
      .update(UserProfileTable)
      .set({
        ...(broken.length ? { portfolioPhotos: next } : {}),
        // A comcard built from deleted photos can't be trusted either; clearing
        // it makes the app fall back to the live collage and rebuild on demand.
        ...(comcardBroken ? { comcardImage: null } : {}),
        updatedBy: 'fix-dangling-portfolio-slots',
      })
      .where(eq(UserProfileTable.userId, profile.userId));
    rowsChanged += 1;
    console.log('  -> cleared');
  }

  console.log(
    `\ndangling slots: ${danglingSlots} | dangling comcards: ${danglingComcards}` +
      (FIX ? ` | rows updated: ${rowsChanged}` : ' | run again with --fix to clear'),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
