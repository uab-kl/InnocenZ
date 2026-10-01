import {
	outletShiftLiveSalesTotal,
	outletTonightFloorTotals,
} from "@agency-portal/lib/outlet-financial-sync";
import type { ShiftRequest } from "@agency-portal/lib/store";
import { describe, expect, it } from "vitest";
import type { ShiftSale } from "@/services/shift-sale";
import { recordedSalesByShift } from "./use-outlet-shift-sales";

/**
 * THE TODAY MONEY TILES READ DEMO DATA (29 Sep 2026 audit).
 *
 * The Sales tile, the card line and the live-sales table priced the night off
 * the demo store's receipt scans and roster counters — both blank on a real
 * login — so a venue whose PRs had RM 1,900 of approved receipts saw RM 0. The
 * server already records the night in `shift_sale`; these pin that it is
 * summed correctly and that the tile maths reads it.
 */

function sale(partial: Partial<ShiftSale>): ShiftSale {
	return {
		id: "row",
		shiftId: "s-1",
		prId: "vicky",
		outletId: "o-1",
		agencyId: "a-1",
		soldOn: "2026-09-14",
		drinkUnits: 0,
		drinkSalesRm: "0.00",
		tipUnits: 0,
		tipSalesRm: "0.00",
		serviceUnits: 0,
		serviceSalesRm: "0.00",
		totalSalesRm: "0.00",
		createdAt: "",
		updatedAt: "",
		createdBy: "",
		updatedBy: "",
		...partial,
	};
}

describe("recordedSalesByShift", () => {
	it("totals each shift and each PR on it, in sen", () => {
		const byShift = recordedSalesByShift([
			sale({
				prId: "vicky",
				drinkUnits: 3,
				drinkSalesRm: "1400.10",
				tipSalesRm: "200.10",
				serviceSalesRm: "300.00",
				totalSalesRm: "1900.20",
			}),
			sale({
				prId: "alice",
				drinkUnits: 1,
				drinkSalesRm: "0.10",
				totalSalesRm: "0.10",
			}),
			sale({ shiftId: "s-2", prId: "vicky", totalSalesRm: "650.00" }),
		]);

		const night = byShift.get("s-1");
		// 1900.20 + 0.10 — float addition would print 1900.3000000000002.
		expect(night?.salesRm).toBe(1900.3);
		expect(night?.drinkUnits).toBe(4);
		expect(night?.byPr.get("vicky")).toEqual({
			salesRm: 1900.2,
			drinkSalesRm: 1400.1,
			drinkUnits: 3,
			tipRm: 200.1,
			serviceRm: 300,
		});
		expect(byShift.get("s-2")?.salesRm).toBe(650);
	});
});

describe("the tile maths reads recorded sales", () => {
	// A PAST night: the clock gate is open, and there are no demo receipts.
	const shift = {
		id: "s-1",
		outletName: "UAB Emhub",
		date: "14 Sep",
		dateIso: "2026-09-14",
		shift: "20:00 - 23:00",
		status: "confirmed",
		prs: ["vicky"],
	} as ShiftRequest;
	const recordedByPrId = recordedSalesByShift([
		sale({
			drinkUnits: 3,
			drinkSalesRm: "1400.00",
			tipSalesRm: "200.00",
			totalSalesRm: "1900.00",
		}),
	]).get("s-1")?.byPr;

	it("the demo path alone says RM 0 for the same night", () => {
		expect(
			outletShiftLiveSalesTotal(shift, {
				outletName: "UAB Emhub",
				rosterSlots: [],
			}),
		).toBe(0);
	});

	it("with the recorded rows it says what was sold", () => {
		expect(
			outletShiftLiveSalesTotal(shift, {
				outletName: "UAB Emhub",
				rosterSlots: [],
				recordedByPrId,
			}),
		).toBe(1900);
		expect(
			outletTonightFloorTotals({
				shift,
				outletName: "UAB Emhub",
				drinkMenu: [],
				rosterSlots: [],
				prIds: ["vicky"],
				recordedByPrId,
			}),
		).toEqual({
			totalSalesRm: 1900,
			totalDrinksRm: 1400,
			drinkUnits: 3,
			totalTipsRm: 200,
		});
	});
});
