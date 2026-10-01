import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { proRataLabel } from "./subscription-record";

/**
 * Owner, 29 Sep 2026: a first partial week is not billed in full. INV-000049's
 * shape under the new rule — an agency approved on Friday 7 Aug pays 2 of the 7
 * days of its first Sun–Sat week, RM 35.71 of a RM 125.00 plan.
 */
const proRata = {
	billedDays: 2,
	periodDays: 7,
	billedFrom: "2026-08-07",
	fullAmount: "125.00",
};
const rm = (amount: number) => `RM ${amount.toFixed(2)}`;

describe("proRataLabel", () => {
	it("says which days of the period were billed, and against what, in English", () => {
		expect(
			proRataLabel(translations.en.subscription.proRatedShare, proRata, rm),
		).toBe("2 of 7 days from 7 Aug 2026 · full period RM 125.00");
	});

	it("fills every placeholder of the 中文 sentence, whose order differs", () => {
		const zh = proRataLabel(
			translations.zh.subscription.proRatedShare,
			proRata,
			rm,
		);
		expect(zh).toBe("7 Aug 2026 起，7 天中的 2 天 · 整期 RM 125.00");
		// `fill` leaves an unmatched hole verbatim — none may survive.
		expect(zh).not.toMatch(/\{\w+\}/);
	});

	it("fills the admin panel's short form in both languages", () => {
		for (const locale of ["en", "zh"] as const) {
			const label = proRataLabel(
				translations[locale].subscription.proRatedShort,
				proRata,
				rm,
			);
			expect(label).toContain("2/7");
			expect(label).not.toMatch(/\{\w+\}/);
		}
	});

	it("prints an unreadable start day as stored instead of dropping the line", () => {
		expect(
			proRataLabel(
				"{n} of {of} from {date}",
				{ ...proRata, billedFrom: "not-a-day" },
				rm,
			),
		).toBe("2 of 7 from not-a-day");
	});
});
