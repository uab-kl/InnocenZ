import { describe, expect, it } from "vitest";
import { isInvoiceOwed, voidReasonOf } from "./index";

/**
 * Owner, 29 Sep 2026: "Add Void". Since a bill can be VOID, "not paid" no
 * longer means "owed" — every screen that summed `status !== "paid"` asks
 * `isInvoiceOwed` instead.
 */
describe("isInvoiceOwed", () => {
	it("only an unpaid bill is owed", () => {
		expect(isInvoiceOwed({ status: "unpaid" })).toBe(true);
		expect(isInvoiceOwed({ status: "paid" })).toBe(false);
		expect(isInvoiceOwed({ status: "void" })).toBe(false);
	});

	it("a status this screen has never heard of is not treated as a debt", () => {
		expect(isInvoiceOwed({ status: "something-new" })).toBe(false);
	});
});

describe("voidReasonOf", () => {
	it("reads the admin's reason back off the note", () => {
		expect(voidReasonOf("Voided: Duplicate charge")).toBe("Duplicate charge");
	});

	it("finds it after a pro-rata sentence the note already carried", () => {
		expect(
			voidReasonOf(
				"Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00) · Voided: Billed before the venue existed",
			),
		).toBe("Billed before the venue existed");
	});

	it("is null for a note with no reason, and for no note at all", () => {
		expect(voidReasonOf(null)).toBeNull();
		expect(
			voidReasonOf(
				"Upgrade Starter → Growth: 250.00 − 125.00 billed this period",
			),
		).toBeNull();
		expect(voidReasonOf("Voided:   ")).toBeNull();
	});
});
