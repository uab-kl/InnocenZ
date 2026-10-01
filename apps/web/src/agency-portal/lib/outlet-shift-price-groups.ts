import {
	effectiveShiftDrinkMenu,
	type OutletDrinkCategory,
	type OutletDrinkPrice,
	outletDrinkCategory,
	type ShiftEventKind,
	sortOutletDrinkMenuByPrice,
	withDrinkCategoriesFromWorkspace,
} from "@agency-portal/lib/outlet-demo";

export interface ShiftPriceLine {
	name: string;
	priceRm: number;
	/** An event price that differs from the venue's Workspace price. */
	changed: boolean;
}

export interface ShiftPriceGroup {
	category: OutletDrinkCategory;
	lines: ShiftPriceLine[];
	minRm: number;
	maxRm: number;
}

/**
 * The shift sheet's prices, split the way the venue keeps them: DRINKS and
 * SERVICE ENTITLEMENT, two lists on the Workspace page since 22 Jul.
 *
 * ⚠️ The sheet printed one flat run of "name RM price" sorted by price, so a
 * RM 30 cocktail, the RM 50 tips row and a RM 1,000 service package read as
 * one list — and the range above it ("Service entitlement · RM 30–1,000") was
 * labelled with only one of the two lists it spanned.
 *
 * Two more things this refuses to do on a REAL session:
 *  - call the prices "event-specific" when the shift carries no event menu. Post
 *    Job persists one since 0167 (`shift_drink_menu`, mapped back as
 *    `eventDrinkMenu`), but a special shift posted before then, or one whose
 *    list was cleared, has none — its prices ARE the Workspace's, and saying
 *    otherwise sends the venue looking for an override that does not exist;
 *  - fall back to the demo menu when the venue has priced nothing. An empty
 *    group is dropped, and an empty sheet is the caller's cue to point at
 *    Workspace rather than print Velvet 23's list.
 */
export function shiftPriceGroups(
	shift: { eventKind?: ShiftEventKind; eventDrinkMenu?: OutletDrinkPrice[] },
	workspaceMenu: OutletDrinkPrice[],
	opts: { backed: boolean },
): { eventSpecific: boolean; groups: ShiftPriceGroup[] } {
	const eventSpecific =
		shift.eventKind === "special" && (shift.eventDrinkMenu?.length ?? 0) > 0;
	const menu = eventSpecific
		? withDrinkCategoriesFromWorkspace(
				shift.eventDrinkMenu ?? [],
				workspaceMenu,
			)
		: opts.backed
			? workspaceMenu
			: effectiveShiftDrinkMenu(shift, workspaceMenu);
	const workspacePrice = new Map(workspaceMenu.map((d) => [d.id, d.priceRm]));

	const groups: ShiftPriceGroup[] = [];
	for (const category of ["drink", "service"] as const) {
		const lines = sortOutletDrinkMenuByPrice(
			menu.filter((d) => outletDrinkCategory(d) === category),
		).map((d) => ({
			name: d.name,
			priceRm: d.priceRm,
			changed: eventSpecific && workspacePrice.get(d.id) !== d.priceRm,
		}));
		if (lines.length === 0) continue;
		const prices = lines.map((l) => l.priceRm);
		groups.push({
			category,
			lines,
			minRm: Math.min(...prices),
			maxRm: Math.max(...prices),
		});
	}
	return { eventSpecific, groups };
}
