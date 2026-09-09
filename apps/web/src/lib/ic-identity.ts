/**
 * What a Malaysian NRIC says about its holder — the browser's copy.
 *
 * The server has the authoritative version (`features/pr-personnel/ic-dob.ts`)
 * and recomputes all of this on every write, so nothing here can be trusted
 * into the database. It exists so the sign-up form can SHOW the person what
 * their number says while they are still looking at it — a birth date that
 * appears as you type is checked by the one person who knows it, where the same
 * value revealed after submission is checked by nobody.
 *
 * Kept small and dependency-free rather than shared through a package: two
 * implementations of one rule is a risk, but the alternative was a build-time
 * link between the API and the landing bundle.
 */

const NRIC_DIGITS = 12;

function digitsOnly(value: string): string {
	return value.replace(/\D/g, "");
}

/** `YYMMDD` → full year, splitting the century at today's two-digit year. */
function fullYear(yy: number, today: Date): number {
	const currentYy = today.getFullYear() % 100;
	return yy <= currentYy ? 2000 + yy : 1900 + yy;
}

/**
 * The birth date encoded in the first six digits, or null when the number is
 * not a 12-digit NRIC or those digits are not a real date. `991332` is twelve
 * digits and not a day, and an invented birth date is worse than a blank one.
 */
export function dobFromNric(
	idNo: string | null | undefined,
	today = new Date(),
): string | null {
	if (!idNo) return null;
	const digits = digitsOnly(idNo);
	if (digits.length !== NRIC_DIGITS) return null;

	const yy = Number(digits.slice(0, 2));
	const mm = Number(digits.slice(2, 4));
	const dd = Number(digits.slice(4, 6));
	if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

	const year = fullYear(yy, today);
	// Round-trip so 31 February is rejected rather than rolled to 3 March.
	const date = new Date(Date.UTC(year, mm - 1, dd));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== mm - 1 ||
		date.getUTCDate() !== dd
	) {
		return null;
	}
	return date.toISOString().slice(0, 10);
}

/** Whole years, counting the month and day so nobody is aged up early. */
export function ageFromDob(
	dob: string | null | undefined,
	today = new Date(),
): number | null {
	if (!dob) return null;
	const born = new Date(`${dob}T00:00:00Z`);
	if (Number.isNaN(born.getTime())) return null;

	let age = today.getUTCFullYear() - born.getUTCFullYear();
	const monthDelta = today.getUTCMonth() - born.getUTCMonth();
	if (
		monthDelta < 0 ||
		(monthDelta === 0 && today.getUTCDate() < born.getUTCDate())
	) {
		age -= 1;
	}
	return age >= 0 ? age : null;
}

/**
 * The gender in the last digit: odd = male, even = female.
 *
 * The form asks the person as well and refuses when the two disagree. That is
 * not politeness — this database holds two accounts whose parity digit is wrong
 * about them, so a mismatch is at least as likely to mean a mistyped id as a
 * mistaken person, and both deserve to be caught before the account exists.
 */
export function genderFromNric(
	idNo: string | null | undefined,
): "male" | "female" | null {
	if (!idNo) return null;
	const digits = digitsOnly(idNo);
	if (digits.length !== NRIC_DIGITS) return null;
	return Number(digits[NRIC_DIGITS - 1]) % 2 === 1 ? "male" : "female";
}

/** Is this a plausible 12-digit NRIC whose date half is a real date? */
export function isNricShaped(idNo: string): boolean {
	return dobFromNric(idNo) !== null;
}
