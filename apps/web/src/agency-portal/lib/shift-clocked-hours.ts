/**
 * The longest check-in → check-out span History presents as a shift.
 *
 * Mirrors `MAX_PLAUSIBLE_SHIFT_HOURS` in
 * apps/backend/src/features/payment-voucher/payment-voucher-audit.ts — the same
 * line the server draws before it will record overtime from a stamp, and the one
 * `src/scripts/_fix-attendance-stamp.ts --list-long` lists by. Change one, change
 * both.
 */
export const MAX_PLAUSIBLE_SHIFT_HOURS = 16;

/**
 * Is this clocked span too long to be a shift — a stamp that is wrong rather
 * than a night that was long?
 *
 * Velvet 23's 23 Jul 22:00–04:00 night was stamped 23 Jul 10:48 → 28 Jul 09:56
 * and History printed it as a "119.13h shift" beside a normal wage. The wage is
 * a sealed figure and stays; only the hours line changes, to say the stamp looks
 * wrong. A missing span (0 — no check-out) is not flagged: nothing was clocked.
 */
export function isImplausibleClockedHours(hours: number): boolean {
	return Number.isFinite(hours) && hours > MAX_PLAUSIBLE_SHIFT_HOURS;
}
