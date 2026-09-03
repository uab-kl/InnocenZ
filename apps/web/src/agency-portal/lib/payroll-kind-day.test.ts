import { describe, expect, it } from "vitest";
import type { AgencyReceipt } from "@/services/payment-voucher";
import {
	anyLineClassified,
	groupLinesByKind,
	receiptKindTotal,
	receiptMatchesKinds,
	toggleKind,
	weekDays,
} from "./payroll-kind-day";

/**
 * The rules behind the Payroll page's Drinks/Tips + day strip.
 *
 * Asserted here rather than only through the two panels because BOTH read this
 * module, and the failure mode is silent: a filter that quietly drops a receipt
 * does not throw, it just shows the agency a smaller week than the one they
 * have. Every case below is one a live receipt actually produces.
 */

const line = (
	id: string,
	kind: AgencyReceipt["lines"][number]["kind"],
	amount: string,
) => ({
	id,
	lineDate: "2026-09-03",
	outlet: "Emhub Testing",
	description: `item ${id}`,
	quantity: 1,
	amount,
	ref: null,
	kind,
});

const receipt = (lines: AgencyReceipt["lines"]): AgencyReceipt =>
	({ id: "r1", lines }) as AgencyReceipt;

describe("weekDays", () => {
	it("returns every day of a Sun–Sat payroll week, earliest first", () => {
		expect(weekDays("2026-08-30", "2026-09-05")).toEqual([
			"2026-08-30",
			"2026-08-31",
			"2026-09-01",
			"2026-09-02",
			"2026-09-03",
			"2026-09-04",
			"2026-09-05",
		]);
	});

	it("does not repeat or skip a day across a DST boundary", () => {
		// Europe/London springs forward on 29 Mar 2026. Local `setDate` arithmetic
		// shifts the clock rather than the calendar and returns the 29th twice.
		expect(weekDays("2026-03-27", "2026-04-02")).toEqual([
			"2026-03-27",
			"2026-03-28",
			"2026-03-29",
			"2026-03-30",
			"2026-03-31",
			"2026-04-01",
			"2026-04-02",
		]);
	});

	it("returns nothing for a malformed range rather than spinning", () => {
		expect(weekDays("not-a-date", "2026-09-05")).toEqual([]);
		expect(weekDays("2026-09-05", "2026-08-30")).toEqual([]);
	});
});

describe("toggleKind", () => {
	it("adds, removes, and keeps drinks before tips whichever is picked first", () => {
		expect(toggleKind([], "tips")).toEqual(["tips"]);
		expect(toggleKind(["tips"], "drinks")).toEqual(["drinks", "tips"]);
		expect(toggleKind(["drinks", "tips"], "drinks")).toEqual(["tips"]);
		expect(toggleKind(["tips"], "tips")).toEqual([]);
	});
});

describe("receiptMatchesKinds", () => {
	const mixed = receipt([
		line("a", "drinks", "45.00"),
		line("b", "drinks", "45.00"),
		line("c", "tips", "100.00"),
	]);

	it("matches everything when nothing is selected", () => {
		expect(receiptMatchesKinds(mixed, [])).toBe(true);
		expect(
			receiptMatchesKinds(receipt([line("w", "wages", "300.00")]), []),
		).toBe(true);
	});

	it("reaches a mixed receipt through ANY of its lines, not every one", () => {
		// The whole point: one order carrying two drinks and a tip must still be
		// reachable when the reviewer asks for tips, or that tip is unreviewable.
		expect(receiptMatchesKinds(mixed, ["tips"])).toBe(true);
		expect(receiptMatchesKinds(mixed, ["drinks"])).toBe(true);
	});

	it("excludes wages and others when both buckets are selected", () => {
		const wages = receipt([line("w", "wages", "300.00")]);
		expect(receiptMatchesKinds(wages, ["drinks", "tips"])).toBe(false);
		expect(receiptMatchesKinds(mixed, ["drinks", "tips"])).toBe(true);
	});

	it("never claims an unclassified line is a drink", () => {
		const unknown = receipt([line("u", undefined, "50.00")]);
		expect(receiptMatchesKinds(unknown, ["drinks"])).toBe(false);
		expect(receiptMatchesKinds(unknown, [])).toBe(true);
	});
});

describe("receiptKindTotal", () => {
	const mixed = receipt([
		line("a", "drinks", "45.00"),
		line("b", "drinks", "45.00"),
		line("c", "tips", "100.00"),
	]);

	it("is the whole receipt when nothing is selected", () => {
		expect(receiptKindTotal(mixed, [])).toBe(190);
	});

	it("is only the selected bucket, never the receipt total", () => {
		expect(receiptKindTotal(mixed, ["tips"])).toBe(100);
		expect(receiptKindTotal(mixed, ["drinks"])).toBe(90);
		expect(receiptKindTotal(mixed, ["drinks", "tips"])).toBe(190);
	});

	it("leaves a wages line out of a drinks+tips subtotal", () => {
		const withWages = receipt([
			line("a", "drinks", "45.00"),
			line("w", "wages", "300.00"),
		]);
		expect(receiptKindTotal(withWages, ["drinks", "tips"])).toBe(45);
	});
});

describe("groupLinesByKind", () => {
	it("orders drinks, tips, wages, others and subtotals each", () => {
		const groups = groupLinesByKind([
			line("c", "tips", "100.00"),
			line("w", "wages", "300.00"),
			line("a", "drinks", "45.00"),
			line("b", "drinks", "45.00"),
		]);
		expect(groups.map((g) => g.kind)).toEqual(["drinks", "tips", "wages"]);
		expect(groups.map((g) => g.total)).toEqual([90, 100, 300]);
	});

	it("keeps an unclassified line last instead of dropping its money", () => {
		// A group that silently vanished would leave the card's line list adding
		// up to less than the printed total on the paper beside it.
		const groups = groupLinesByKind([
			line("u", undefined, "50.00"),
			line("a", "drinks", "45.00"),
		]);
		expect(groups.map((g) => g.kind)).toEqual(["drinks", ""]);
		expect(groups.reduce((sum, g) => sum + g.total, 0)).toBe(95);
	});
});

describe("anyLineClassified", () => {
	it("tells a week with no drinks apart from a build that cannot label them", () => {
		expect(anyLineClassified([receipt([line("a", "drinks", "45.00")])])).toBe(
			true,
		);
		expect(anyLineClassified([receipt([line("u", undefined, "45.00")])])).toBe(
			false,
		);
		expect(anyLineClassified([])).toBe(false);
	});
});
