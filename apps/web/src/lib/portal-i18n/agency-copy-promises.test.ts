import { describe, expect, it } from "vitest";
import { translations } from "./translations";

/**
 * Copy that promises something the product does not do (28 Sep 2026 audit).
 *
 * - Add PR: the sheet said an invite would be sent. `POST /pr` sends nothing —
 *   it adds a password-less account the PR claims by signing up with the same
 *   mobile number.
 * - History: the shift ledger's total is the SEALED WAGE of each completed
 *   shift, not money paid, and it does not match the payroll vouchers (which
 *   carry commission, deductions, and only what was filed). It said "paid out"
 *   and "shift totals match … payroll PVs", beside a Paid tab whose real paid
 *   total disagreed with it.
 */
describe.each(["en", "zh"] as const)("%s", (locale) => {
	const t = translations[locale];

	it("Add PR promises no invite", () => {
		const copy = [
			t.agencyPending.addPrHint,
			t.agencyPending.addToRoster,
			t.agencyPending.addingToRoster,
		].join(" ");
		expect(copy.toLowerCase()).not.toContain("invite");
		expect(copy).not.toContain("邀请");
	});

	it("the shift ledger's total is not called money paid out", () => {
		expect(t.history.summaryLine.toLowerCase()).not.toContain("paid out");
		expect(t.history.summaryLine).not.toContain("已支付");
		expect(t.history.summaryLine).toContain("{total}");
	});

	it("the agency header leads with take-home and keeps the wage part beside it", () => {
		// Owner default, 29 Sep 2026: take-home is the headline, wages beside it.
		expect(t.history.summaryLine).toContain("{total}");
		expect(t.history.summaryLine).toContain("{wages}");
		// While the take-home's other half loads, the line states wages ALONE —
		// never a take-home missing a part.
		expect(t.history.summaryLineWagesOnly).toContain("{total}");
		expect(t.history.summaryLineWagesOnly).not.toContain("{wages}");
		expect(t.history.summaryLineWagesOnly.toLowerCase()).not.toContain(
			"take-home",
		);
		expect(t.history.summaryLineWagesOnly).not.toContain("实得");
	});

	it("the OUTLET ledger's total is wages, not money paid out (29 Sep follow-up)", () => {
		expect(t.history.summary.toLowerCase()).not.toContain("paid out");
		expect(t.history.summary).not.toContain("已支付");
		expect(t.history.summary).toContain("{total}");
		// The figure arrives formatted with its currency — a literal "RM" in the
		// template would print it twice.
		expect(t.history.summary).not.toContain("RM");
	});

	it("the shift views no longer claim to match the payroll vouchers", () => {
		for (const hint of [t.history.prViewHint, t.history.outletViewHint]) {
			expect(hint.toLowerCase()).not.toContain("match");
			expect(hint).not.toContain("一致");
		}
	});
});
