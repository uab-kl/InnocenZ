import { generateAndStoreComcard } from '@/util/comcard-generate';
import { normalizePortfolioSlots } from '@/util/portfolio-image';
import { r2Configured } from '@/util/r2';
import { logger } from '@/util/logger';

/**
 * The profile fields that are PRINTED on the comcard. A write that touches any
 * of them leaves the saved PNG stating something the profile no longer claims,
 * so it has to be re-rendered.
 *
 * `dob`/`idNo` are here because the age on the card is derived from them, even
 * though neither is editable through the PR routes any more — a backfill or an
 * identity repair still moves the printed number.
 */
export const COMCARD_PRINTED_FIELDS = [
  'fullName',
  'username',
  'nickname',
  'name',
  'idNo',
  'dob',
  'comcardHeightCm',
  'comcardWeightKg',
  'portfolioPhotos',
] as const;

/** Did this patch touch anything the card shows? Keys with `undefined` do not count. */
export function touchesComcard(patch: Record<string, unknown> | null | undefined): boolean {
  if (!patch) return false;
  return COMCARD_PRINTED_FIELDS.some((field) => patch[field] !== undefined);
}

/**
 * Re-render and store this user's comcard.
 *
 * Lives here, server-side, rather than in either client. The PR edits their
 * measurements through `PUT /user/:id` and the agency edits the SAME columns
 * through `PUT /pr/:id`; wiring the refresh into one of those clients leaves
 * the other silently writing a profile whose card still shows the old numbers,
 * which is exactly what happened — height went 155 → 160 from the agency side
 * and the PNG kept saying 155.
 *
 * NEVER throws. A profile save that succeeded must not be reported as failed
 * because the picture could not be redrawn; the caller gets `false` and the
 * old card stays until the next write.
 */
export async function refreshStoredComcard(params: {
  userId: string;
  fullName: string | null | undefined;
  /** Preferred display name; falls back to `fullName` then 'PR' — the precedence every caller uses. */
  username: string | null | undefined;
  idNo: string | null | undefined;
  dob: string | Date | null | undefined;
  heightCm: number | null | undefined;
  weightKg: number | null | undefined;
  /** The jsonb column's shape: drizzle infers a nullable array of nullable strings. */
  portfolioPhotos: (string | null)[] | string[] | null | undefined;
  /** Persist the new object key. Called only on success. */
  save: (storedKey: string) => Promise<void>;
}): Promise<boolean> {
  if (!r2Configured()) return false;

  // No photos, no collage. Not an error: most of the roster has none, and a
  // measurement edit on such a PR simply has no card to refresh.
  const slots = normalizePortfolioSlots(params.portfolioPhotos);
  if (!slots.some(Boolean)) return false;

  try {
    const storedKey = await generateAndStoreComcard({
      userId: params.userId,
      fullName: params.fullName,
      displayName: params.username || params.fullName || 'PR',
      dob: params.dob,
      idNo: params.idNo,
      heightCm: params.heightCm,
      weightKg: params.weightKg,
      portfolioPhotos: slots,
    });
    // `generateAndStoreComcard` prunes every other object under the PR's comcard
    // prefix, so there is no previous key to delete here and no orphan to leave.
    await params.save(storedKey);
    return true;
  } catch (error) {
    logger.warn('[comcard] refresh after profile write failed (profile saved)', {
      userId: params.userId,
      error,
    });
    return false;
  }
}
