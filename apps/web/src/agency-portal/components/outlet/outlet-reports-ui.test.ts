import { describe, expect, it } from "vitest";
import { formatCompactRm, pctOfSales, pnlBarPct } from "./outlet-reports-ui";

/**
 * A LOSS NIGHT IS SHOWN AS A LOSS (22 Oct 2026). Velvet 23 has wages on every
 * night and no floor sales at all; Reports drew "Net earned by night" as a row
 * of RM 0.00 bars beside "Venue share −RM 5,075.00", and printed "PR spend 0%"
 * beside RM 5,075 of PR spend.
 */

describe("pctOfSales", () => {
	it("is a whole-percent share of floor sales", () => {
		expect(pctOfSales(250, 1000)).toBe(25);
		// A night that cost more than it sold has a negative margin, not 0%.
		expect(pctOfSales(-500, 1000)).toBe(-50);
	});

	it("is null — never 0% — when there were no floor sales", () => {
		expect(pctOfSales(5075, 0)).toBeNull();
		expect(pctOfSales(-5075, 0)).toBeNull();
	});
});

describe("pnlBarPct", () => {
	it("holds a segment's width to 0–100%", () => {
		expect(pnlBarPct(400, 1000)).toBe(40);
		expect(pnlBarPct(-200, 1000)).toBe(0);
		expect(pnlBarPct(1500, 1000)).toBe(100);
		expect(pnlBarPct(5075, 0)).toBe(0);
	});
});

describe("formatCompactRm", () => {
	it("compacts a loss night like a good one, sign before the currency", () => {
		expect(formatCompactRm(12_000)).toBe("RM 12k");
		expect(formatCompactRm(-1500)).toBe("−RM 1.5k");
		expect(formatCompactRm(-700)).toBe("−RM 700.00");
		expect(formatCompactRm(0)).toBe("RM 0.00");
	});
});
