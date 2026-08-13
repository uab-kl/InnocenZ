/**
 * Date of birth and age, derived from identity rather than stored separately.
 *
 * Leaf module: imports nothing from the feature tree, so both the PR-facing and
 * agency-facing read paths can share it without an import cycle.
 *
 * The rule the owner set is "age follows their IC". That is only literally
 * possible for a Malaysian NRIC, whose first six digits ARE the birth date as
 * YYMMDD — a passport or work-permit number carries no date at all. So the
 * derivation is: NRIC when one is present and parseable, stored `dob`
 * otherwise. Deriving it HERE, once, rather than in each client is what makes
 * "the PR's screen and the agency's screen show the same age" true by
 * construction; the mobile profile previously computed its own with
 * `Math.max(18, thisYear - birthYear)`, which both ignored the month and
 * invented 18 for anyone younger.
 */

const NRIC_DIGITS = 12;

/** Digits only — NRICs are written `950312-14-8821` about as often as bare. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * `YYMMDD` → full year. An NRIC carries no century, so the convention is the
 * usual one: a two-digit year at or below the current one is this century,
 * anything above it is the last. In 2026 that reads `26` as 2026 and `95` as
 * 1995 — and it is why this takes `today`, so the boundary is testable rather
 * than drifting with the clock.
 */
function fullYear(yy: number, today: Date): number {
  const currentYy = today.getFullYear() % 100;
  return yy <= currentYy ? 2000 + yy : 1900 + yy;
}

/**
 * The birth date encoded in a Malaysian NRIC, or null when the number is not an
 * NRIC or its first six digits are not a real date.
 *
 * Returns null rather than guessing: `991332` is twelve digits and not a day,
 * and a fabricated birth date is worse than an absent one.
 */
export function dobFromNric(idNo: string | null | undefined, today = new Date()): string | null {
  if (!idNo) return null;
  const digits = digitsOnly(idNo);
  if (digits.length !== NRIC_DIGITS) return null;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const year = fullYear(yy, today);
  // Round-trip through a real date so 31 February is rejected rather than
  // silently rolled forward to 3 March.
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * The birth date to show and count from: the IC's when it has one, else the
 * stored profile value.
 *
 * The IC WINS on disagreement. That is the owner's rule, and it is load-bearing
 * on live data — one PR's stored `dob` is a year off her own NRIC, so the two
 * sources genuinely differ and something has to be authoritative.
 */
export function effectiveDob(
  input: { idNo?: string | null; dob?: string | null },
  today = new Date(),
): string | null {
  return dobFromNric(input.idNo, today) ?? input.dob ?? null;
}

/**
 * Whole years elapsed. Counts the month and day, so someone born in December is
 * not aged up for the eleven months before their birthday.
 */
export function ageFromDob(dob: string | null | undefined, today = new Date()): number | null {
  if (!dob) return null;
  const born = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;

  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < born.getUTCDate())) age -= 1;
  // A future birth date is bad data, not a negative age.
  return age >= 0 ? age : null;
}

/** The derived pair both portals render. Null where identity is incomplete. */
export function derivedAge(
  input: { idNo?: string | null; dob?: string | null },
  today = new Date(),
): { dob: string | null; age: number | null; fromIc: boolean } {
  const fromIc = dobFromNric(input.idNo, today);
  const dob = fromIc ?? input.dob ?? null;
  return { dob, age: ageFromDob(dob, today), fromIc: fromIc != null };
}
