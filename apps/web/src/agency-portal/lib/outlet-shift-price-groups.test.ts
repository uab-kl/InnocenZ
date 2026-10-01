import type { OutletDrinkPrice } from "@agency-portal/lib/outlet-demo";
import { describe, expect, it } from "vitest";
import { shiftPriceGroups } from "./outlet-shift-price-groups";

/**
 * THE SHIFT SHEET LISTED PRICES AS ONE FLAT LIST (29 Sep 2026 audit, live).
 *
 * Drinks and Service Entitlement are two lists on Workspace; the sheet ran them
 * together by price under a single "Service entitlement" range, called a
 * special shift's plain Workspace prices "event-specific", and on an unpriced
 * real venue fell back to the demo menu.
 */

const WORKSPACE: OutletDrinkPrice[] = [
	{ id: "havoc", name: "Havoc", priceRm: 1000, category: "service" },
	{ id: "lemon", name: "Lemon Drop", priceRm: 30, category: "drink" },
	{ id: "cosmo", name: "Cosmo", priceRm: 150, category: "drink" },
	{ id: "tips", name: "Tips", priceRm: 50, category: "tip" as never },
];

describe("shiftPriceGroups", () => {
	it("splits drinks from services, each with its own range", () => {
		const { groups, eventSpecific } = shiftPriceGroups(
			{ eventKind: "special" },
			WORKSPACE,
			{ backed: true },
		);
		expect(eventSpecific).toBe(false);
		expect(groups.map((g) => g.category)).toEqual(["drink", "service"]);
		expect(groups[0]).toMatchObject({
			minRm: 30,
			maxRm: 150,
			lines: [{ name: "Lemon Drop" }, { name: "Cosmo" }],
		});
		// Tips is priced on the Service Entitlement list, as on Workspace.
		expect(groups[1]?.lines.map((l) => l.name)).toEqual(["Tips", "Havoc"]);
	});

	it("only an event menu is 'event-specific', and it flags changed prices", () => {
		const { groups, eventSpecific } = shiftPriceGroups(
			{
				eventKind: "special",
				eventDrinkMenu: [
					{ id: "cosmo", name: "Cosmo", priceRm: 180, category: "drink" },
					{ id: "lemon", name: "Lemon Drop", priceRm: 30, category: "drink" },
				],
			},
			WORKSPACE,
			{ backed: true },
		);
		expect(eventSpecific).toBe(true);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.lines).toEqual([
			{ name: "Lemon Drop", priceRm: 30, changed: false },
			{ name: "Cosmo", priceRm: 180, changed: true },
		]);
	});

	it("a real venue with no prices gets nothing — never the demo menu", () => {
		expect(
			shiftPriceGroups({ eventKind: "normal" }, [], { backed: true }),
		).toEqual({ eventSpecific: false, groups: [] });
	});
});
