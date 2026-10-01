import { formatRM as kitFormatRM } from "@agency-portal/components/iz/ui";
import { describe, expect, it } from "vitest";
import { formatRM } from "./format-rm";
import { formatRMPlain } from "./pr-demo";

/**
 * NEGATIVE MONEY, ONE SIGN, BEFORE THE CURRENCY (30 Sep 2026).
 *
 * A PR whose week's deductions outran its earnings saw "RM -4.50" as their
 * take-home: the signed number was formatted whole, so the sign landed inside
 * the amount. It reads "−RM 4.50" now — U+2212, the glyph the PR app's Payment
 * grid already prints — and the kit and the lib print it through ONE function,
 * so the two copies that both carried the bug cannot drift apart again.
 */

const MINUS = "−";

describe("formatRM", () => {
	it("a negative reads −RM 4.50, never RM -4.50", () => {
		expect(formatRM(-4.5)).toBe(`${MINUS}RM 4.50`);
		expect(formatRM(-4.5)).not.toContain("-");
	});

	it("zero and positives are unchanged", () => {
		expect(formatRM(0)).toBe("RM 0.00");
		expect(formatRM(4.5)).toBe("RM 4.50");
		expect(formatRM(20)).toBe("RM 20.00");
	});

	it("thousands are grouped on either side of zero", () => {
		expect(formatRM(1234.5)).toBe("RM 1,234.50");
		expect(formatRM(-1234.5)).toBe(`${MINUS}RM 1,234.50`);
		expect(formatRM(-1234567.891)).toBe(`${MINUS}RM 1,234,567.89`);
	});

	it("nothing that prints as 0.00 carries a sign", () => {
		expect(formatRM(-0)).toBe("RM 0.00");
		expect(formatRM(-0.004)).toBe("RM 0.00");
		expect(formatRM(-0.01)).toBe(`${MINUS}RM 0.01`);
	});

	it("a deduction is shown by passing it negative — one sign, not two", () => {
		const fee = 20;
		expect(formatRM(-fee)).toBe(`${MINUS}RM 20.00`);
	});
});

describe("one implementation behind every name", () => {
	it.each([-1234.5, -4.5, -0, 0, 4.5, 1234.5])(
		"%d prints the same from the kit, the lib and the leaf",
		(n) => {
			expect(kitFormatRM(n)).toBe(formatRM(n));
			expect(formatRMPlain(n)).toBe(formatRM(n));
		},
	);
});
