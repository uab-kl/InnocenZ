import { describe, expect, it } from "vitest";
import { weekCellAmount } from "./PrWeeklyPaymentGrid";

/**
 * A FEE TAKEN OFF A DAY IS SHOWN, NOT DASHED OUT (30 Sep 2026).
 *
 * The PR portal's weekly grid printed "—" for any cell `<= 0`, so a negative
 * figure vanished from its cell while the week's total still counted it. A
 * negative now reads "−20.00" — the PR app's `formatCell` glyph — and only a
 * zero is a dash.
 */

const MINUS = "−";

describe("weekCellAmount", () => {
	it("prints money off with its minus", () => {
		expect(weekCellAmount(-20)).toBe(`${MINUS}20.00`);
		expect(weekCellAmount(-4.5)).toBe(`${MINUS}4.50`);
	});

	it("keeps zero a dash", () => {
		expect(weekCellAmount(0)).toBe("—");
		expect(weekCellAmount(-0)).toBe("—");
	});

	it("prints positives as before", () => {
		expect(weekCellAmount(12.5)).toBe("12.50");
		expect(weekCellAmount(1234.5)).toBe("1,234.50");
	});
});
