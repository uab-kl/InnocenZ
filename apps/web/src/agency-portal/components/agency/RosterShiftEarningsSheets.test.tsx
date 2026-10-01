import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * THE DRINKS / TIPS SHEET ON A REAL SESSION BREAKS DOWN WHAT THE SERVER RECORDED.
 *
 * A real login blanks the demo store the old sheet priced from, so it answered
 * "No drink sales logged for this shift yet." beneath a column holding the
 * night. With the recorded rows handed in (`shift_sale`, per slot), the sheet
 * lists each PR booked on the shift with the column's own figure; without them
 * (a demo session) it keeps the fixture tables.
 */

vi.mock("@/lib/portal-i18n/context", async () => {
	const { translations } = await import("@/lib/portal-i18n/translations");
	return { usePortalLocale: () => ({ t: translations.en, locale: "en" }) };
});

import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import type {
	RecordedFloorSales,
	RosterShiftEarningsContext,
} from "@agency-portal/lib/outlet-financial-sync";
import { translations } from "@/lib/portal-i18n/translations";
import { RosterShiftEarningsSheets } from "./RosterShiftEarningsSheets";

afterEach(cleanup);

const en = translations.en;

const slot = (id: string, prId: string, prName: string): AgencyRosterSlot => ({
	id,
	prId,
	prName,
	outlet: "Emhub",
	date: "2026-09-29",
	dateIso: "2026-09-29",
	shift: "22:00 – 04:00",
	shiftStart: "22:00",
	shiftEnd: "04:00",
	status: "on-duty",
	wageRm: 500,
});

const vicky = slot("a1", "p1", "Vicky");
const mei = slot("a2", "p2", "Mei");

const context = {
	rosterScope: [vicky, mei],
	agencyPRs: [],
	outletShifts: [],
	drinkMenu: [],
	happyHourStart: "20:00",
	happyHourEnd: "22:00",
	workspaceTierRates: {},
} as unknown as RosterShiftEarningsContext;

const recorded = new Map<string, RecordedFloorSales>([
	["a1", { salesRm: 1350.5, drinkSalesRm: 300.1, drinkUnits: 3, tipRm: 50.5 }],
]);

describe("RosterShiftEarningsSheets — recorded floor sales", () => {
	it("lists each PR's recorded drink sales and the shift total", () => {
		render(
			<RosterShiftEarningsSheets
				kind="drinks"
				anchorSlot={vicky}
				earningsContext={context}
				recordedBySlotId={recorded}
				onClose={() => {}}
			/>,
		);
		expect(screen.getByText(en.agencyRoster.recordedSalesHint)).toBeTruthy();
		expect(screen.getByText("Vicky")).toBeTruthy();
		// Booked, nothing recorded — a dash, not RM 0.00.
		expect(screen.getByText("Mei")).toBeTruthy();
		expect(screen.getByText("—")).toBeTruthy();
		expect(screen.getAllByText("RM 300.10")).toHaveLength(2);
		expect(screen.getByText(en.agencyRoster.shiftTotal)).toBeTruthy();
		expect(
			screen.queryByText(en.agencyRoster.noDrinkSalesThisShift),
		).toBeNull();
	});

	it("lists tips the same way", () => {
		render(
			<RosterShiftEarningsSheets
				kind="tips"
				anchorSlot={vicky}
				earningsContext={context}
				recordedBySlotId={recorded}
				onClose={() => {}}
			/>,
		);
		expect(screen.getAllByText("RM 50.50")).toHaveLength(2);
	});

	it("says nothing was logged when the server holds no row for the shift", () => {
		render(
			<RosterShiftEarningsSheets
				kind="tips"
				anchorSlot={vicky}
				earningsContext={context}
				recordedBySlotId={new Map()}
				onClose={() => {}}
			/>,
		);
		expect(screen.getByText(en.agencyRoster.noTipsThisShift)).toBeTruthy();
	});
});
