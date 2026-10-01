import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceRm } from "./utils";

/**
 * "RM -4.50" ON THE ADMIN VOUCHER TOTAL (30 Sep 2026).
 *
 * The admin Payment Voucher detail printed its totals as `RM {formatPrice}`, so
 * a week whose deductions outran its earnings read "RM -4.50" — the sign inside
 * the amount. `formatPriceRm` puts it in front, as every portal does, and leaves
 * `formatPrice` (and its other callers) exactly as they were.
 */

const MINUS = "−";

describe("formatPriceRm", () => {
	it("prints a negative as −RM 4.50, never RM -4.50", () => {
		expect(formatPriceRm("-4.50")).toBe(`${MINUS}RM 4.50`);
		expect(formatPriceRm(-4.5)).toBe(`${MINUS}RM 4.50`);
	});

	it("leaves zero and positives as they read before", () => {
		expect(formatPriceRm("0.00")).toBe("RM 0.00");
		expect(formatPriceRm("468.00")).toBe("RM 468.00");
		expect(formatPriceRm("1234.5")).toBe("RM 1,234.50");
		expect(formatPriceRm("-1234.5")).toBe(`${MINUS}RM 1,234.50`);
	});

	it("never signs a figure that prints as 0.00", () => {
		expect(formatPriceRm(-0)).toBe("RM 0.00");
		expect(formatPriceRm("-0.004")).toBe("RM 0.00");
	});

	it("still says RM — when there is no number", () => {
		expect(formatPriceRm(null)).toBe("RM —");
		expect(formatPriceRm(undefined)).toBe("RM —");
		expect(formatPriceRm("not a number")).toBe("RM —");
	});

	it("does not change formatPrice itself", () => {
		expect(formatPrice("-4.50")).toBe("-4.50");
		expect(formatPrice("1234.5")).toBe("1,234.50");
	});
});
