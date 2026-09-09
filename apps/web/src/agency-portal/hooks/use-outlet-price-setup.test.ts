import type { OutletDrinkPrice } from "@agency-portal/lib/outlet-demo";
import { describe, expect, test } from "vitest";
import { outletPriceBucketsMissing } from "./use-outlet-price-setup";

/**
 * Velvet 23's real menu, as it is stored today (9 Sep 2026): six priced drinks,
 * two priced services, and a tips row that arrived as `category: 'tip'` — a
 * third value the web's own type does not name, which is exactly why the tips
 * rule matches on the id and the name instead of the category.
 */
const VELVET_MENU = [
	{
		id: "drink-1785132809045",
		name: "Lemon Drop",
		priceRm: 30,
		category: "drink",
	},
	{ id: "cosmo", name: "Cosmo", priceRm: 150, category: "drink" },
	{
		id: "booking-com",
		name: "Booking commission",
		priceRm: 100,
		category: "service",
	},
	{ id: "havoc", name: "Havoc", priceRm: 1000, category: "service" },
	// Stored as 'tip'; the web maps anything not 'drink' to 'service'.
	{
		id: "service-1785132698158",
		name: "Tips",
		priceRm: 50,
		category: "service",
	},
] satisfies OutletDrinkPrice[];

describe("outletPriceBucketsMissing", () => {
	test("names all three lists when a brand-new venue has no menu at all", () => {
		expect(outletPriceBucketsMissing([])).toEqual([
			"drinks",
			"tips",
			"services",
		]);
	});

	test("stays silent for a venue whose three lists are all priced", () => {
		expect(outletPriceBucketsMissing(VELVET_MENU)).toEqual([]);
	});

	test("finds the tips row even though it is filed under services", () => {
		const withoutTips = VELVET_MENU.filter((d) => d.name !== "Tips");
		expect(outletPriceBucketsMissing(withoutTips)).toEqual(["tips"]);
	});

	test("a row named but priced at zero is not a price", () => {
		const unpriced = VELVET_MENU.map((d) => ({ ...d, priceRm: 0 }));
		expect(outletPriceBucketsMissing(unpriced)).toEqual([
			"drinks",
			"tips",
			"services",
		]);
	});

	test("reports only the lists still empty, so a half-filled venue is told what is left", () => {
		const drinksOnly = VELVET_MENU.filter((d) => d.category === "drink");
		expect(outletPriceBucketsMissing(drinksOnly)).toEqual(["tips", "services"]);
	});

	test("a legacy row with no category counts as a service", () => {
		const legacy: OutletDrinkPrice[] = [
			{ id: "old-1", name: "Table charge", priceRm: 80 },
		];
		expect(outletPriceBucketsMissing(legacy)).toEqual(["drinks", "tips"]);
	});
});
