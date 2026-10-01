import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	buildShiftSaleInput,
	initialSaleInput,
	isUnchangedSale,
	keptBesideDrinksRm,
	MAX_LOGGED_SALE_RM,
	parseSaleAmount,
	recordedSaleFor,
	recordedSaleTotalRm,
	saleLoggedText,
	shiftSheetSalesLog,
} from "./outlet-sales-log";

/**
 * LOG SALES AS A REAL WRITE, PER PR (owner default, 29 Sep 2026). Nothing here
 * sends a request — this is the input the panel would POST, and every refusal
 * it makes before it gets that far.
 *
 * "Count services too" (owner, 29 Sep 2026): the server's total is drinks +
 * tips + services, every row is editable, and the services travel back as
 * recorded.
 */

const recorded = {
	shiftId: "s-1",
	prId: "vicky",
	drinkUnits: 3,
	drinkSalesRm: "450.00",
	tipUnits: 2,
	tipSalesRm: "80.50",
	serviceUnits: 0,
	serviceSalesRm: "0.00",
};

/** A row a receipt wrote, services included — read-only until 29 Sep 2026. */
const withServices = {
	...recorded,
	serviceUnits: 4,
	serviceSalesRm: "720.00",
};

describe("parseSaleAmount", () => {
	it.each([
		["1250", 1250],
		["1,250.50", 1250.5],
		["  99.9 ", 99.9],
		["RM 300", 300],
		["rm1,000", 1000],
		["0", 0],
		["0.05", 0.05],
	])("reads %j as RM %d", (raw, rm) => {
		expect(parseSaleAmount(raw)).toEqual({ ok: true, rm });
	});

	it("an empty box is not a zero", () => {
		expect(parseSaleAmount("   ")).toEqual({ ok: false, reason: "empty" });
	});

	it.each([
		"-50",
		"12.345",
		"1,25,0",
		"12a",
		"1e5",
		"Infinity",
		"..5",
		"1,250.5.5",
	])("refuses %j", (raw) => {
		expect(parseSaleAmount(raw)).toEqual({ ok: false, reason: "invalid" });
	});

	it("catches a slipped key above one PR's night", () => {
		expect(parseSaleAmount(String(MAX_LOGGED_SALE_RM))).toEqual({
			ok: true,
			rm: MAX_LOGGED_SALE_RM,
		});
		expect(parseSaleAmount("1000000")).toEqual({
			ok: false,
			reason: "tooLarge",
		});
	});
});

describe("buildShiftSaleInput", () => {
	it("changes the drink RM and carries back everything else on the row", () => {
		// The POST replaces the whole row: omitting the units and tips would
		// write them as 0 and erase what the PR's receipts recorded.
		expect(
			buildShiftSaleInput({
				shiftId: "s-1",
				prId: "vicky",
				drinkSalesRm: 612.345,
				recorded,
			}),
		).toEqual({
			shiftId: "s-1",
			prId: "vicky",
			drinkSalesRm: 612.35,
			drinkUnits: 3,
			tipSalesRm: 80.5,
			tipUnits: 2,
			serviceSalesRm: 0,
			serviceUnits: 0,
		});
	});

	it("a row carrying a receipt's SERVICES is editable, and sends them back as recorded", () => {
		expect(
			buildShiftSaleInput({
				shiftId: "s-1",
				prId: "vicky",
				drinkSalesRm: 500,
				recorded: withServices,
			}),
		).toEqual({
			shiftId: "s-1",
			prId: "vicky",
			drinkSalesRm: 500,
			drinkUnits: 3,
			tipSalesRm: 80.5,
			tipUnits: 2,
			serviceSalesRm: 720,
			serviceUnits: 4,
		});
	});

	it("a PR with nothing recorded logs the drink figure and zeros, and leaves services to the server", () => {
		const input = buildShiftSaleInput({
			shiftId: "s-1",
			prId: "alice",
			drinkSalesRm: 200,
		});
		expect(input).toEqual({
			shiftId: "s-1",
			prId: "alice",
			drinkSalesRm: 200,
			drinkUnits: 0,
			tipSalesRm: 0,
			tipUnits: 0,
		});
		// Omitted, not zero: the server keeps whatever services the row holds —
		// a receipt approved after the panel last read must not be wiped.
		expect("serviceSalesRm" in input).toBe(false);
		expect("serviceUnits" in input).toBe(false);
	});

	it("never sends a negative or non-numeric carried field", () => {
		const input = buildShiftSaleInput({
			shiftId: "s-1",
			prId: "vicky",
			drinkSalesRm: 10,
			recorded: {
				...recorded,
				drinkUnits: -4,
				tipUnits: Number.NaN,
				tipSalesRm: "not money",
				serviceUnits: -1,
				serviceSalesRm: "-50.00",
			},
		});
		expect(input.drinkUnits).toBe(0);
		expect(input.tipUnits).toBe(0);
		expect(input.tipSalesRm).toBe(0);
		expect(input.serviceUnits).toBe(0);
		expect(input.serviceSalesRm).toBe(0);
	});
});

describe("the recorded total — drinks + tips + services", () => {
	it("adds all three buckets, services included", () => {
		expect(recordedSaleTotalRm(withServices)).toBe(1250.5);
		expect(recordedSaleTotalRm(recorded)).toBe(530.5);
		expect(recordedSaleTotalRm(undefined)).toBe(0);
	});

	it("adds in sen, never drifting by a float's worth", () => {
		expect(
			recordedSaleTotalRm({
				drinkSalesRm: "0.10",
				tipSalesRm: "0.20",
				serviceSalesRm: "0.40",
			}),
		).toBe(0.7);
	});

	it("names what a save keeps beside the drinks — tips and services", () => {
		expect(keptBesideDrinksRm(withServices)).toBe(800.5);
		expect(keptBesideDrinksRm({ ...recorded, tipSalesRm: "0.00" })).toBe(0);
		expect(keptBesideDrinksRm(undefined)).toBe(0);
	});
});

describe("what the panel refuses before it asks", () => {
	it("the recorded figure is not a change — no write for it", () => {
		expect(isUnchangedSale(450, recorded)).toBe(true);
		expect(isUnchangedSale(450.01, recorded)).toBe(false);
		// Nothing recorded and zero typed: nothing to log.
		expect(isUnchangedSale(0, undefined)).toBe(true);
		expect(isUnchangedSale(5, undefined)).toBe(false);
	});

	it("the box opens on what is recorded, blank when nothing is", () => {
		expect(initialSaleInput(recorded)).toBe("450.00");
		expect(initialSaleInput({ drinkSalesRm: "0.00" })).toBe("");
		expect(initialSaleInput(undefined)).toBe("");
	});

	it("finds a PR's own row on the shift, and no other", () => {
		const rows = [
			recorded,
			{ ...recorded, prId: "alice" },
			{ ...recorded, shiftId: "s-2" },
		];
		expect(recordedSaleFor(rows, "s-1", "alice")?.prId).toBe("alice");
		expect(recordedSaleFor(rows, "s-9", "vicky")).toBeUndefined();
	});
});

describe("shiftSheetSalesLog — which Log Sales a shift sheet draws", () => {
	const sheet = {
		backed: true,
		hidden: false,
		canLogSales: true,
		status: "confirmed",
	};

	it("a real session's sheet gets Today's per-PR panel, whatever the status", () => {
		// The panel itself applies live-or-ended and sealed — the sheet must not
		// second-guess it with a rule of its own.
		for (const status of ["confirmed", "sealed", "open"]) {
			expect(shiftSheetSalesLog({ ...sheet, status })).toBe("perPr");
		}
	});

	it("the same grant as Today and the server: no `logSales`, no panel", () => {
		expect(shiftSheetSalesLog({ ...sheet, canLogSales: false })).toBeNull();
		expect(
			shiftSheetSalesLog({ ...sheet, canLogSales: false, status: "sealed" }),
		).toBeNull();
	});

	it("a host that draws Log Sales itself (Today's cards) gets no second panel", () => {
		expect(shiftSheetSalesLog({ ...sheet, hidden: true })).toBeNull();
		// …but a sealed card still says why nothing can be logged.
		expect(
			shiftSheetSalesLog({ ...sheet, hidden: true, status: "sealed" }),
		).toBe("lockedNote");
	});

	it("a demo session keeps its per-drink counter, confirmed shifts only", () => {
		const demo = { ...sheet, backed: false };
		expect(shiftSheetSalesLog(demo)).toBe("demoCounter");
		expect(shiftSheetSalesLog({ ...demo, status: "sealed" })).toBe(
			"lockedNote",
		);
		expect(shiftSheetSalesLog({ ...demo, status: "open" })).toBeNull();
		// The demo Calendar hides it, as it always did.
		expect(shiftSheetSalesLog({ ...demo, hidden: true })).toBeNull();
	});
});

describe("saleLoggedText — the server's sentence, in the reader's words", () => {
	it.each(["en", "zh"] as const)("%s", (locale) => {
		const t = translations[locale].today;
		expect(saleLoggedText("Sale logged", t)).toBe(t.saleLoggedServer);
		expect(saleLoggedText("Sale logged.", t)).toBe(t.saleLoggedServer);
		// A sentence it does not know is shown as the server wrote it.
		expect(saleLoggedText("Sale logged — receipts pending", t)).toBe(
			"Sale logged — receipts pending",
		);
	});
});
