import type { OutletDrinkPrice } from "@agency-portal/lib/outlet-demo";
import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	fillPriceRange,
	formatMenuPriceRm,
	menuPriceRangeText,
} from "./price-range";
import { priceListHint } from "./ShiftEventPriceEditor";

/**
 * ONE PRICE FORMATTER FOR THE OUTLET PORTAL (22 Oct 2026): Workspace printed
 * "RM 50–1000" beside the shift sheet's "RM 50–1,000", one-price lists printed
 * "RM 50–50" / "RM 0–0", and the seeded Tips row was counted as a service.
 */

const en = translations.en.workspace;
const zh = translations.zh.workspace;

describe("formatMenuPriceRm", () => {
	it("groups thousands", () => {
		expect(formatMenuPriceRm(1000)).toBe("1,000");
		expect(formatMenuPriceRm(12500)).toBe("12,500");
	});

	it("prints whole ringgit whole and keeps a real cent price", () => {
		expect(formatMenuPriceRm(50)).toBe("50");
		expect(formatMenuPriceRm(0)).toBe("0");
		// Rounding this to "13" would print a price the venue never set.
		expect(formatMenuPriceRm(12.5)).toBe("12.50");
	});
});

describe("fillPriceRange", () => {
	it("prints both ends of a real range, separated", () => {
		expect(
			fillPriceRange(en.drinksSummary, { min: 50, max: 1000 }, { n: 3 }),
		).toBe("3 drinks · RM 50–1,000");
	});

	it("collapses a one-price range to one price, in both languages", () => {
		expect(
			fillPriceRange(en.servicesSummary, { min: 150, max: 150 }, { n: 2 }),
		).toBe("2 services · RM 150");
		expect(
			fillPriceRange(zh.servicesSummary, { min: 0, max: 0 }, { n: 2 }),
		).toBe("2 项服务 · RM 0");
		expect(
			fillPriceRange(translations.en.postJob.pricesWorkspace, {
				min: 50,
				max: 50,
			}),
		).toBe("Workspace · RM 50");
	});

	it("bare range text", () => {
		expect(menuPriceRangeText({ min: 50, max: 1000 })).toBe("50–1,000");
		expect(menuPriceRangeText({ min: 0, max: 0 })).toBe("0");
	});
});

describe("priceListHint", () => {
	const tips: OutletDrinkPrice = {
		id: "tips",
		name: "Tips",
		priceRm: 0,
		category: "tip",
	};
	const booking: OutletDrinkPrice = {
		id: "booking",
		name: "Booking commission",
		priceRm: 1000,
		category: "service",
	};
	const hint = (items: OutletDrinkPrice[]) =>
		priceListHint(
			items,
			en.addServicesBelow,
			en.servicesSummary,
			en.servicesSummaryOne,
		);

	it("does not count the seeded Tips row as a service", () => {
		// Live at two venues: Tips was the only row, and read "1 service · RM 0–0".
		expect(hint([tips])).toBe(en.addServicesBelow);
	});

	it("leaves Tips out of the count AND the range", () => {
		expect(hint([tips, booking])).toBe("1 service · RM 1,000");
	});

	it("also spots a venue's own tips row by its category", () => {
		expect(hint([{ ...tips, id: "custom-tip" }, booking])).toBe(
			"1 service · RM 1,000",
		);
	});

	it("counts and ranges real services as before", () => {
		expect(
			hint([booking, { ...booking, id: "vip", name: "VIP", priceRm: 50 }]),
		).toBe("2 services · RM 50–1,000");
	});
});
