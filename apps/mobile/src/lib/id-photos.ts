/**
 * Which sides of the PR's ID card are NOT on file.
 *
 * Pure, and the reason Profile can offer the upload again. Sign-up is the only
 * other place the card is ever sent, after the account already exists; a
 * failed upload there was caught, named in a toast the screen unmounted before
 * it could be read, and left the agency with no ID and the PR with no button.
 *
 * A passport has one side. Anything else (MyKad / NRIC, or a type not yet set)
 * has two — the same rule the sign-up flow applies (`needsIdBack`).
 *
 * ⚠️ An ABSENT field is not a missing photo. A backend that does not send the
 * two fields says nothing about them, and nagging on "unknown" would put every
 * PR's Profile in front of a card they already sent.
 */
export type IdPhotoSide = 'front' | 'back';

export function missingIdPhotoSides(
  profile:
    | {
        idType?: string | null;
        idPhotoFront?: string | null;
        idPhotoBack?: string | null;
      }
    | null
    | undefined,
): IdPhotoSide[] {
  if (!profile) return [];
  const missing: IdPhotoSide[] = [];
  if ('idPhotoFront' in profile && !profile.idPhotoFront?.trim()) {
    missing.push('front');
  }
  if (
    profile.idType !== 'Passport' &&
    'idPhotoBack' in profile &&
    !profile.idPhotoBack?.trim()
  ) {
    missing.push('back');
  }
  return missing;
}
