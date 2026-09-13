import type { PrPvRow } from "@agency-portal/lib/pr-demo";
import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	type PvEarningsBreakdown,
	pvBreakdownRows,
	summarizePvRows,
} from "./pv-breakdown";

const t = translations.en;

const row = (component: string, amt: number, desc = "line"): PrPvRow =>
	({ i: 0, desc, qty: 1, amt, component }) as never;

/**
 * Live voucher PV-000001 is the shape these tests are written from: four
 * positive buckets summing to RM 488.00, one `component='deduction'` line of
 * -RM 20.00, and a subtotal of RM 468.00. The card used to render the four and
 * the subtotal, and nothing at all for the RM 20 between them.
 */
describe("summarizePvRows", () => {
	it("keeps a deduction out of Other, in its own bucket", () => {
		const b = summarizePvRows([
			row("wages", 400),
			row("drink_commission", 50),
			row("tip_commission", 38),
			row("deduction", -20),
		]);
		expect(b.wages).toBe(400);
		expect(b.other).toBe(0);
		expect(b.deductions).toBe(-20);
	});

	it("does not move the subtotal by splitting the bucket out", () => {
		const b = summarizePvRows([
			row("wages", 400),
			row("drink_commission", 50),
			row("tip_commission", 38),
			row("deduction", -20),
		]);
		// PV-000001's real net.
		expect(b.total).toBe(468);
	});

	it("keeps genuine Other money separate from a deduction", () => {
		// The two used to share a bucket and cancel out: +20 and -20 rendered as
		// no row at all, with both figures still inside the total.
		const b = summarizePvRows([row("other", 20), row("deduction", -20)]);
		expect(b.other).toBe(20);
		expect(b.deductions).toBe(-20);
		expect(b.total).toBe(0);
	});
});

describe("pvBreakdownRows", () => {
	const base: PvEarningsBreakdown = {
		wages: 400,
		drinks: 50,
		tips: 38,
		overtime: 0,
		other: 0,
		deductions: -20,
		total: 468,
	};

	it("shows the deduction the card used to hide", () => {
		const rows = pvBreakdownRows(base, t);
		const deduction = rows.find((r) => r.key === "deductions");
		expect(deduction).toBeDefined();
		expect(deduction?.value).toBe(-20);
	});

	it("marks it red, per the owner's colour code", () => {
		expect(
			pvBreakdownRows(base, t).find((r) => r.key === "deductions")?.tone,
		).toBe("red");
	});

	it("puts it last, after every earning", () => {
		const rows = pvBreakdownRows({ ...base, other: 15 }, t);
		expect(rows[rows.length - 1]?.key).toBe("deductions");
	});

	it("still hides an empty bucket", () => {
		const rows = pvBreakdownRows(base, t);
		expect(rows.some((r) => r.key === "overtime")).toBe(false);
		expect(rows.some((r) => r.key === "other")).toBe(false);
	});

	it("adds no deduction row when there is none", () => {
		const rows = pvBreakdownRows({ ...base, deductions: 0 }, t);
		expect(rows.some((r) => r.key === "deductions")).toBe(false);
	});

	it("shows the rows summing to the subtotal, with nothing unaccounted for", () => {
		const rows = pvBreakdownRows(base, t);
		const shown = rows.reduce((sum, r) => sum + r.value, 0);
		// The whole point: what is printed must add up to what is totalled.
		expect(shown).toBe(base.total);
	});
});
