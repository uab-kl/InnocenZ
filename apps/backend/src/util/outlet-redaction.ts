import { IDENTITY_DOC_FIELDS } from './user-profile-image';

/**
 * The outlet privacy decision, applied to the two payloads that were missing it.
 *
 * OWNER DECISION (30 Jul 2026), quoted from `redact-identity-docs.ts`: *"an
 * outlet may see WHO is working at its venue, not who they are. Coordinates stay
 * closed … and IC number, date of birth, home address and both sides of the ID
 * photo now go with them."*
 *
 * That middleware sets `req.redactIdentityDocs`. Until 3 Sept 2026 exactly one
 * response honoured the flag — `GET /user`, through `withUserProfile`. A sweep
 * of all 55 outlet-reachable GETs found the same decision undelivered on two
 * others:
 *
 *   - `GET /pr` shipped `icNo` and `profile.dob`. With `?pageSize=200` a venue
 *     read 44 PRs across two agencies — 5 ICs, 23 DOBs — where six people had
 *     ever worked there. (The 44 is deliberate: an outlet may book from its
 *     approved agencies' rosters. The row SET was right; the FIELDS were not.)
 *   - `GET /shift-assignment` shipped a PR's cancellation fine and metre-level
 *     check-in/out coordinates, on the very router whose header says outlets are
 *     "left OUT even for their own venues" on staff positions.
 *
 * BLANKED, NEVER DELETED — the same rule `user-profile-image.ts` gives: a screen
 * reading a null renders an empty field, while a missing key renders `undefined`
 * or throws on a destructure, and a privacy fix that breaks a roster is a
 * privacy fix that gets reverted.
 *
 * ⚠️ These lists blank what they NAME. A sensitive column added to `pr`,
 * `user_profile` or `shift_assignment` and not added here is a column handed to
 * every venue — the same warning `user-profile.model.ts` already carries.
 */

/** Identity fields carried at the TOP level of a PR roster row (not under `profile`). */
const PR_ROW_IDENTITY_FIELDS = [
  // The IC number. Note the spelling: `icNo` on the PR row, `idNo` inside
  // `profile`. One person, one document, two column names — which is precisely
  // why blanking the profile alone would leave the venue holding the number.
  'icNo',
  'idNo',
  'idType',
  'dob',
  'address',
  'addressLine1',
  'addressLine2',
  'bankName',
  'bankAccountNo',
] as const;

/**
 * Assignment fields an outlet must not receive.
 *
 * Two groups, and the line drawn inside each is deliberate:
 *
 *  1. THE FINE. `cancelFeeRm` and friends are a penalty the agency charged its
 *     PR, and `cancelFeeVoucherId` points into that PR's payroll document. This
 *     is the PR's discipline record — the owner's rule on 3 Sept 2026 was
 *     "ignore the deductions, the outlet is not supposed to see them", and a
 *     cancellation fee is a deduction wearing a different column name.
 *     `cancelNoticeHours` deliberately STAYS: how much notice a venue got is the
 *     venue's own operational fact, carrying no money and no judgement.
 *
 *  2. THE COORDINATES. Raw lat/lng is where a person physically stood.
 *     `checkInDistanceM` / `checkInAccuracyM` deliberately STAY: they are
 *     measured FROM the venue's own location, which the venue already knows, and
 *     they are the evidence behind a geofence dispute. Distance from a point you
 *     own is not a position.
 *
 * `leaveProofPhotos` is a photographed medical certificate. `leaveStatus` stays
 * — a venue must know the PR is not coming; it must not see the doctor's note.
 */
const ASSIGNMENT_PRIVATE_FIELDS = [
  'cancelFeeRm',
  'cancelFeePct',
  'cancelFeeChargedAt',
  'cancelFeeVoucherId',
  'cancelFeeWaivedAt',
  'cancelFeeWaivedBy',
  'cancelFeeWaiveReason',
  'checkInLat',
  'checkInLng',
  'checkOutLat',
  'checkOutLng',
  'leaveProofPhotos',
] as const;

function blank<T extends object>(row: T, fields: readonly string[]): T {
  const copy = { ...row } as Record<string, unknown>;
  for (const field of fields) {
    // Only blank what the row actually carries. Adding the key back as null on a
    // payload that never had it would widen the shape rather than narrow it.
    if (field in copy) copy[field] = null;
  }
  return copy as T;
}

/**
 * One PR roster row, safe for a venue: the person they book, not the documents
 * that identify them off the job.
 *
 * `name`, `nickname`, `tier`, `status`, the comcard and the portfolio all stay —
 * that is the profile a venue books from, the same line `user-profile-image.ts`
 * draws. `phone` and `email` also stay: a venue that has booked someone needs a
 * way to reach them on the night, and neither is an identity document. If that
 * is later judged too wide, add them to `PR_ROW_IDENTITY_FIELDS` — the point of
 * this module is that the decision now has ONE place to be made.
 */
export function redactPrRowForOutlet<T extends object>(row: T): T {
  const top = blank(row, PR_ROW_IDENTITY_FIELDS) as Record<string, unknown>;
  const profile = top.profile;
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    // AGE SURVIVES THIS, and it matters that it does.
    //
    // Age is a booking fact of the same class as height, languages and the
    // comcard, all of which this rule deliberately keeps; a birth DATE is the
    // identity document. `toUserProfileResponse` already derives `age` from
    // `dob` before the row reaches here — verified 3 Sept 2026: of every live
    // profile carrying a `dob`, none arrives without an `age`. So blanking the
    // date costs the venue nothing it is entitled to.
    //
    // A derive-age-here fallback was written for the case where it does not,
    // then deleted: on current data it never fired, and a branch that never
    // runs is a branch nobody notices going wrong. If `age` ever stops being
    // derived upstream, put it back — the fallback belongs wherever `age` is
    // produced, not in the redactor.
    top.profile = blank(profile as object, IDENTITY_DOC_FIELDS);
  }
  return top as T;
}

/** Every row of a PR list, when the caller is an outlet. */
export function redactPrRowsForOutlet<T extends object>(rows: T[]): T[] {
  return rows.map((row) => redactPrRowForOutlet(row));
}

/** One shift-assignment row, safe for a venue. */
export function redactAssignmentForOutlet<T extends object>(row: T): T {
  return blank(row, ASSIGNMENT_PRIVATE_FIELDS);
}

/** Every row of an assignment list, when the caller is an outlet. */
export function redactAssignmentsForOutlet<T extends object>(rows: T[]): T[] {
  return rows.map((row) => redactAssignmentForOutlet(row));
}
