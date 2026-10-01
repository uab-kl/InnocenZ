/** U+2212 MINUS SIGN — the glyph the PR app's Payment grid prints, never a hyphen. */
const MINUS = "−";

/**
 * Ringgit as every portal prints it: "RM 1,234.50" — and a NEGATIVE as
 * "−RM 4.50", the sign in front of the currency.
 *
 * Formatting the signed number put the sign INSIDE the amount, so a week whose
 * deductions outran its earnings read "RM -4.50" (seen on a PR's take-home,
 * 30 Sep 2026). The magnitude is formatted and the minus placed before it.
 *
 * Signed on what is PRINTED: a value that rounds to 0.00 (−0, float dust such as
 * −0.001) prints unsigned, never "−RM 0.00".
 *
 * ONE sign per figure: a caller showing a deduction passes it negative
 * (`formatRM(-fee)`), never a minus of its own in front of this.
 *
 * A LEAF module — no imports — so the component kit (`iz/ui`, which re-exports
 * it) and the libs (`pr-demo`, `pv-pdf`) share one implementation without
 * either importing the other.
 */
export function formatRM(n: number): string {
	const amount = Math.abs(n).toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const negative = n < 0 && /[1-9]/.test(amount);
	return `${negative ? MINUS : ""}RM ${amount}`;
}
