import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * WHAT THE AGENCY READS ON A HISTORY CARD, AND UNDER THE FLOOR TABLE.
 *
 * The History header says take-home; each PR card under it used to print the
 * wage alone as "Total payout". These pin the words and figures a reader sees:
 * the card states the take-home with the wage part beside it, says "Wages" when
 * that is all it can state, and the payout breakdown lists the deductions it
 * subtracted. The floor table's foot line is pinned in both languages — it was
 * English glued around two amounts, with no key to translate.
 *
 * Rendered with the REAL dictionaries; the store is stubbed.
 */

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "zh" }));

vi.mock("@/lib/portal-i18n/context", async () => {
	const { translations } = await import("@/lib/portal-i18n/translations");
	return {
		usePortalLocale: () => ({
			t: translations[localeState.locale],
			locale: localeState.locale,
		}),
	};
});

vi.mock("@agency-portal/lib/store", () => ({
	useStore: (select: (s: unknown) => unknown) =>
		select({
			agencyPRs: [],
			outletCommissionRules: [],
			outletWorkspace: { perDrinkRm: 150 },
		}),
}));

import { translations } from "@/lib/portal-i18n/translations";
import { OutletPrLiveSalesFloorTable } from "./OutletPrLiveSalesFloorTable";
import { OutletPrHistoryCard } from "./outlet-history-ui";
import { ShiftHistoryMoneyBreakdownView } from "./ShiftHistoryMoneyBreakdownView";

afterEach(() => {
	cleanup();
	localeState.locale = "en";
});

const rollup = {
	prId: "pr-1",
	prName: "Vicky",
	shiftCount: 3,
	venues: ["Emhub"],
	latestDateIso: "2026-09-21",
	latestDateDisplay: "21 Sep",
	totalPayout: 1687.5,
	totalDrinks: 4,
	totalTips: 50,
	drinkSalesRm: 600,
	serviceSalesRm: 0,
	totalReceived: 650,
	totalTables: 0,
};

describe("OutletPrHistoryCard — agency take-home", () => {
	it("states the take-home, with the wage part beside it", () => {
		render(
			<OutletPrHistoryCard
				rollup={rollup}
				rank={1}
				topPayout={1640}
				portal="agency"
				agencyPRs={[]}
				money={{ takeHomeRm: 1640, wagesRm: 1600 }}
			/>,
		);
		expect(
			screen.getByText(translations.en.history.metricTakeHome),
		).toBeTruthy();
		expect(screen.getByText("RM 1,640.00")).toBeTruthy();
		expect(screen.getByText("RM 1,600.00 in wages")).toBeTruthy();
		// Never the old wage-only label beside a take-home figure.
		expect(
			screen.queryByText(translations.en.history.metricTotalPayout),
		).toBeNull();
	});

	it("says Wages — and only the wage — while the take-home cannot be stated", () => {
		render(
			<OutletPrHistoryCard
				rollup={rollup}
				rank={1}
				topPayout={1600}
				portal="agency"
				agencyPRs={[]}
				money={{ takeHomeRm: null, wagesRm: 1600 }}
			/>,
		);
		expect(screen.getByText(translations.en.history.metricWages)).toBeTruthy();
		expect(screen.getByText("RM 1,600.00")).toBeTruthy();
		expect(screen.queryByText(/in wages/)).toBeNull();
	});

	it("prints a NEGATIVE take-home with one sign, before the currency", () => {
		// A week whose deductions outran its earnings (seen 30 Sep 2026).
		render(
			<OutletPrHistoryCard
				rollup={rollup}
				rank={1}
				topPayout={20}
				portal="agency"
				agencyPRs={[]}
				money={{ takeHomeRm: -4.5, wagesRm: 20 }}
			/>,
		);
		expect(screen.getByText("−RM 4.50")).toBeTruthy();
		expect(screen.queryByText(/RM -/)).toBeNull();
	});

	it("keeps the outlet History's plain payout when no take-home is handed in", () => {
		render(
			<OutletPrHistoryCard
				rollup={rollup}
				rank={1}
				topPayout={1687.5}
				portal="outlet"
				agencyPRs={[]}
			/>,
		);
		expect(
			screen.getByText(translations.en.history.metricTotalPayout),
		).toBeTruthy();
		expect(screen.getByText("RM 1,687.50")).toBeTruthy();
	});
});

describe("ShiftHistoryMoneyBreakdownView — deductions", () => {
	it("lists what the vouchers took off, so the parts add up to the take-home", () => {
		render(
			<ShiftHistoryMoneyBreakdownView
				kind="payout"
				breakdown={{
					drinkSalesRm: 0,
					tipSalesRm: 0,
					serviceSalesRm: 0,
					totalReceived: 0,
					drinkUnits: 0,
					wagesRm: 1600,
					otRm: 30,
					drinkCommissionRm: 45.5,
					tipCommissionRm: 12,
					deductionsRm: 47.5,
					totalPayout: 1640,
				}}
			/>,
		);
		expect(screen.getByText(translations.en.payroll.deductions)).toBeTruthy();
		expect(screen.getByText("−RM 47.50")).toBeTruthy();
		expect(screen.getByText("RM 1,640.00")).toBeTruthy();
	});

	it("a week the deductions outran reads −RM, and every figure keeps ONE sign", () => {
		render(
			<ShiftHistoryMoneyBreakdownView
				kind="payout"
				breakdown={{
					drinkSalesRm: 0,
					tipSalesRm: 0,
					serviceSalesRm: 0,
					totalReceived: 0,
					drinkUnits: 0,
					wagesRm: 20,
					otRm: 0,
					drinkCommissionRm: 0,
					tipCommissionRm: 0,
					deductionsRm: 24.5,
					totalPayout: -4.5,
				}}
			/>,
		);
		expect(screen.getByText("−RM 4.50")).toBeTruthy();
		expect(screen.getByText("−RM 24.50")).toBeTruthy();
		expect(screen.getByText("RM 20.00")).toBeTruthy();
		// Neither the old hyphen inside the amount nor a doubled sign.
		expect(screen.queryByText(/RM -|−−/)).toBeNull();
	});

	it("shows no deductions line when nothing was deducted", () => {
		render(
			<ShiftHistoryMoneyBreakdownView
				kind="payout"
				breakdown={{
					drinkSalesRm: 0,
					tipSalesRm: 0,
					serviceSalesRm: 0,
					totalReceived: 0,
					drinkUnits: 0,
					wagesRm: 500,
					otRm: 0,
					drinkCommissionRm: 0,
					tipCommissionRm: 0,
					totalPayout: 500,
				}}
			/>,
		);
		expect(screen.queryByText(translations.en.payroll.deductions)).toBeNull();
	});
});

describe("OutletPrLiveSalesFloorTable — foot line", () => {
	const row = {
		prName: "Vicky",
		prId: "pr-1",
		dailyWagesRm: 500,
		hhDrinkSalesRm: 100,
		hhDrinkPct: 10,
		hhCommissionRm: 10,
		normalDrinkSalesRm: 200,
		normalDrinkPct: 10,
		normalCommissionRm: 20,
		tipSalesRm: 55.5,
		tipPct: 10,
		tipCommissionRm: 5.55,
		otHours: 0,
		otRmPerHour: 0,
		otPayRm: 0,
		totalEarnRm: 535.55,
	};

	it("reads in English", () => {
		render(<OutletPrLiveSalesFloorTable rows={[row]} />);
		expect(
			screen.getByText("Floor drinks RM 300.00 · tips RM 55.50"),
		).toBeTruthy();
	});

	it("reads in Chinese under the 中文 switch", () => {
		localeState.locale = "zh";
		render(<OutletPrLiveSalesFloorTable rows={[row]} />);
		expect(screen.getByText("现场酒水 RM 300.00 · 小费 RM 55.50")).toBeTruthy();
		expect(screen.queryByText(/Floor drinks/)).toBeNull();
	});
});
