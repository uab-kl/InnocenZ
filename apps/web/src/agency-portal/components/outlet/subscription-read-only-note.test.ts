import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { subscriptionReadOnlyNote } from "./subscription-read-only-note";

/**
 * EVERY LANE THAT CANNOT PAY IS TOLD WHY (22 Oct 2026: the Guarantor saw no
 * Pay on Subscription and no note, while Finance and Ops each got one).
 */

const en = translations.en;

describe("subscriptionReadOnlyNote", () => {
	it("says nothing to the owner, who pays", () => {
		expect(
			subscriptionReadOnlyNote(
				{ canEdit: true, canPay: true, isFinance: false },
				en,
			),
		).toBeNull();
	});

	it("tells the guarantor that pay is the owner's alone", () => {
		expect(
			subscriptionReadOnlyNote(
				{ canEdit: true, canPay: false, isFinance: false },
				en,
			),
		).toBe(en.outletSubscription.guarantorReadOnly);
	});

	it("keeps Finance's own note", () => {
		expect(
			subscriptionReadOnlyNote(
				{ canEdit: false, canPay: false, isFinance: true },
				en,
			),
		).toBe(en.outletSubscription.financeReadOnly);
	});

	it("keeps the member note for Ops Head and Director", () => {
		expect(
			subscriptionReadOnlyNote(
				{ canEdit: false, canPay: false, isFinance: false },
				en,
			),
		).toBe(en.outletSubscription.memberReadOnly);
	});

	it("has a Chinese sentence for the guarantor too", () => {
		expect(translations.zh.outletSubscription.guarantorReadOnly).toMatch(
			/担保人/,
		);
	});
});
