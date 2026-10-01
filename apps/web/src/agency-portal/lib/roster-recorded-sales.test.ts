import { describe, expect, it } from "vitest";
import type { AgencyRosterSlot } from "./agency-demo";
import {
	liveSalesFromRecorded,
	recordedSalesBySlotId,
	rosterRecordedSalesRows,
} from "./roster-recorded-sales";

const sale = (
	shiftId: string,
	prId: string,
	drinkSalesRm: string,
	tipSalesRm: string,
	drinkUnits = 1,
	totalSalesRm = "0.00",
) => ({ shiftId, prId, drinkUnits, drinkSalesRm, tipSalesRm, totalSalesRm });

const slot = (
	id: string,
	prId: string,
	overrides: Partial<AgencyRosterSlot> = {},
): AgencyRosterSlot => ({
	id,
	prId,
	prName: prId.toUpperCase(),
	outlet: "Emhub",
	date: "2026-09-29",
	dateIso: "2026-09-29",
	shift: "22:00 – 04:00",
	shiftStart: "22:00",
	shiftEnd: "04:00",
	status: "on-duty",
	...overrides,
});

describe("recordedSalesBySlotId", () => {
	it("joins each assignment to its own (shift, PR) row, by id", () => {
		const map = recordedSalesBySlotId(
			[
				sale("s1", "p1", "300.00", "50.50", 2, "1350.50"),
				sale("s1", "p2", "0.00", "20.00", 0, "20.00"),
			],
			[
				{ id: "a1", shiftId: "s1", prId: "p1" },
				{ id: "a2", shiftId: "s1", prId: "p2" },
				// Same PR on another shift — its own row, which does not exist.
				{ id: "a3", shiftId: "s2", prId: "p1" },
			],
		);
		expect(map.get("a1")).toEqual({
			salesRm: 1350.5,
			drinkSalesRm: 300,
			drinkUnits: 2,
			tipRm: 50.5,
		});
		expect(map.get("a2")?.tipRm).toBe(20);
		expect(map.has("a3")).toBe(false);
	});

	it("never matches across PRs on one shift", () => {
		const map = recordedSalesBySlotId(
			[sale("s1", "p1", "300.00", "0.00")],
			[{ id: "a2", shiftId: "s1", prId: "p2" }],
		);
		expect(map.size).toBe(0);
	});
});

describe("liveSalesFromRecorded", () => {
	it("reads nothing recorded as zeros, which the columns print as a dash", () => {
		expect(liveSalesFromRecorded(undefined)).toEqual({
			salesRm: 0,
			drinkSalesRm: 0,
			drinkUnits: 0,
			tipRm: 0,
			hhDrinkSalesRm: null,
		});
	});

	it("has no happy-hour split to report — the row carries no receipt times", () => {
		expect(
			liveSalesFromRecorded({
				salesRm: 10,
				drinkSalesRm: 8,
				drinkUnits: 1,
				tipRm: 2,
			}).hhDrinkSalesRm,
		).toBeNull();
	});
});

describe("rosterRecordedSalesRows", () => {
	it("lists every PR booked on the anchor's shift with its recorded figures and totals", () => {
		const anchor = slot("a1", "p1");
		const scope = [
			anchor,
			slot("a2", "p2"),
			// Another venue, another night, or off the plan — not this shift.
			slot("a3", "p3", { outlet: "Elsewhere" }),
			slot("a4", "p4", { dateIso: "2026-09-28" }),
			slot("a5", "p5", { status: "unavailable" }),
		];
		const recorded = recordedSalesBySlotId(
			[
				sale("s1", "p1", "300.10", "50.05", 3),
				sale("s9", "p3", "999.00", "999.00", 9),
			],
			[
				{ id: "a1", shiftId: "s1", prId: "p1" },
				{ id: "a3", shiftId: "s9", prId: "p3" },
			],
		);

		const result = rosterRecordedSalesRows(anchor, scope, recorded);
		expect(result.rows.map((r) => [r.slotId, r.recorded])).toEqual([
			["a1", true],
			["a2", false],
		]);
		expect(result.drinkUnits).toBe(3);
		expect(result.drinkSalesRm).toBe(300.1);
		expect(result.tipRm).toBe(50.05);
	});
});
