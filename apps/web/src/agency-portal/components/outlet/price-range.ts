import { fill } from "@/lib/portal-i18n/fill";

/**
 * ONE way to print a menu price, so every outlet surface agrees (22 Oct 2026:
 * Workspace read "RM 50–1000" while the shift sheet read "RM 50–1,000").
 *
 * Thousands separators always. Whole ringgit prints whole; anything else keeps
 * its two decimals — `price_rm` is numeric(12,2) and the editor takes decimals,
 * so rounding RM 12.50 to "13" (what `formatOutletPriceRm` does) would print a
 * price the venue never set.
 */
export function formatMenuPriceRm(amount: number): string {
	const whole = Number.isInteger(amount);
	return amount.toLocaleString("en-MY", {
		minimumFractionDigits: whole ? 0 : 2,
		maximumFractionDigits: whole ? 0 : 2,
	});
}

/**
 * Fill a dictionary sentence carrying a `{min}–{max}` price range, collapsing
 * the range to ONE price when both ends print the same ("RM 50", not
 * "RM 50–50" or "RM 0–0").
 *
 * The collapse rewrites the template's `{min}–{max}` hole rather than adding a
 * second key per sentence: every range sentence in both languages carries that
 * exact hole, and the agency portal still fills the same keys with `min`/`max`.
 * A template written without it simply keeps printing both ends.
 */
export function fillPriceRange(
	template: string,
	range: { min: number; max: number },
	values: Record<string, string | number> = {},
): string {
	const min = formatMenuPriceRm(range.min);
	const max = formatMenuPriceRm(range.max);
	const tpl = min === max ? template.replace("{min}–{max}", "{min}") : template;
	return fill(tpl, { ...values, min, max });
}

/** "50" or "50–1,000" — for a range printed without a sentence around it. */
export function menuPriceRangeText(range: {
	min: number;
	max: number;
}): string {
	return fillPriceRange("{min}–{max}", range);
}
