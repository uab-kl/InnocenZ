/**
 * DOES THE IC PRINTED ON A VOUCHER STILL MATCH THE PR'S PROFILE?
 *
 * `payment_voucher.pr_ic` is copied from the profile when the voucher is
 * opened (the payee's identity, as issued). The profile can be corrected
 * afterwards, and then the two disagree — PV-000009 carried "950312-14-8821"
 * while the PR's profile reads "960312-14-8820". A payment document naming the
 * wrong identity number is worth a warning, not a silent rewrite: which one is
 * right is a person's call.
 *
 * One rule for every reader — the agency/admin voucher detail read and the
 * `_check-voucher-pr-ic.ts` data script both come here, so they cannot disagree
 * about what "differs" means.
 */

/**
 * The comparable form: upper-case letters and digits only. A MyKad typed with
 * or without dashes ("950312-14-8821" / "950312148821") is the same number; a
 * passport keeps its letters. Null when nothing comparable is left.
 */
export function normalizeIc(ic: string | null | undefined): string | null {
  if (ic == null) return null;
  const compact = ic.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return compact.length > 0 ? compact : null;
}

/**
 * True when both are present and name the same number, false when both are
 * present and differ, and NULL when either side is missing — "cannot compare"
 * is a different fact from "matches", and a screen must not paint it green.
 */
export function prIcMatchesProfile(
  voucherIc: string | null | undefined,
  profileIc: string | null | undefined,
): boolean | null {
  const a = normalizeIc(voucherIc);
  const b = normalizeIc(profileIc);
  if (a === null || b === null) return null;
  return a === b;
}

/** Characters kept in the clear at the END of a masked IC — and nowhere else. */
const MASK_TAIL = 2;
const MASK_CHAR = '•';

/**
 * For printing in a script or a log: the LAST TWO characters only, every other
 * letter or digit as •, separators dropped. "950312-14-8821" → "••••••••••21",
 * a passport "A1234567" → "••••••21".
 *
 * It used to keep the first four as well, and a MyKad's first six digits are
 * the holder's date of birth — four of them in a log is most of a birthday.
 * Separators go too, so the mask does not say which document type it was.
 * A value too short to hide anything behind its tail (≤ 4 characters) is all •.
 */
export function maskIc(ic: string | null | undefined): string {
  if (ic == null || ic.trim() === '') return '(none)';
  const chars = ic.match(/[0-9A-Za-z]/g) ?? [];
  if (chars.length === 0) return '(none)';
  const tail = chars.length > MASK_TAIL * 2 ? MASK_TAIL : 0;
  return (
    MASK_CHAR.repeat(chars.length - tail) +
    chars.slice(chars.length - tail).join('')
  );
}
