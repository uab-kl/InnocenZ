import { useOutletWorkspace } from "@agency-portal/hooks/use-outlet-workspace";
import {
	type OutletDrinkPrice,
	outletDrinkCategory,
} from "@agency-portal/lib/outlet-demo";
import { useMemo } from "react";

/** The three price lists a venue is asked to fill before its first night. */
export type OutletPriceBucket = "drinks" | "tips" | "services";

export interface OutletPriceSetupState {
	/** Which buckets still carry no priced row — in display order. */
	missing: OutletPriceBucket[];
	/** True when at least one bucket is empty and the reminder should show. */
	needsPrices: boolean;
	isLoading: boolean;
}

/**
 * A row counts as SET only when it carries a real price.
 *
 * `price_rm` defaults to 0, so a venue can hold rows that name a drink and
 * charge nothing for it — which is not a finished price list. Counting those as
 * done would clear the reminder before a single price was entered.
 */
function isPriced(item: OutletDrinkPrice): boolean {
	return Number(item.priceRm) > 0;
}

/**
 * Tips live INSIDE the service list, not beside it.
 *
 * There is no tips category in the web's type — `OutletDrinkCategory` is
 * `drink | service`, and `outletDrinkCategory()` folds everything that is not a
 * drink into `service`. The live database does carry rows written with a third
 * category, `tip` (Velvet 23's row is one), so the category field alone cannot
 * find them here. Matched the way `history-demo-sync` already classifies a sale
 * line as tips: the seeded id, or a name that says tip. The owner names these
 * three lists separately, so the reminder has to tell them apart.
 */
function isTipsItem(item: OutletDrinkPrice): boolean {
	return item.id === "tips" || item.name.trim().toLowerCase().includes("tip");
}

/**
 * Which of the three lists carry no priced row — the whole decision, as a pure
 * function of the menu.
 *
 * Split out of the hook so it can be tested against REAL menu shapes and not
 * only the empty one a new venue starts with. The Tips rule is why: a fresh
 * account has no rows of any kind, so the case that actually matters — a venue
 * whose tips row arrived under the third category and would otherwise sit
 * unnoticed inside services — cannot be checked by looking at a new account.
 */
export function outletPriceBucketsMissing(
	menu: OutletDrinkPrice[],
): OutletPriceBucket[] {
	const drinks = menu.filter((d) => outletDrinkCategory(d) === "drink");
	const nonDrinks = menu.filter((d) => outletDrinkCategory(d) !== "drink");
	const tips = nonDrinks.filter(isTipsItem);
	const services = nonDrinks.filter((d) => !isTipsItem(d));

	const empty: OutletPriceBucket[] = [];
	if (!drinks.some(isPriced)) empty.push("drinks");
	if (!tips.some(isPriced)) empty.push("tips");
	if (!services.some(isPriced)) empty.push("services");
	return empty;
}

/**
 * Does this venue still owe its Drinks / Tips / Services prices?
 *
 * Every night's money is priced from these lists — a shift's drink and service
 * lines, and the receipts the PR's phone shows — so a venue can be staffed with
 * them empty and only discover the gap when somebody tries to log what was
 * sold. A brand-new venue has no `outlet_workspace` row at all (the API answers
 * 404, which `useOutletWorkspace` surfaces as a null workspace), so all three
 * read empty.
 *
 * Demo sessions are excluded via `backed`: their prices come from the demo
 * store, and a reminder pointing at a Workspace that is not theirs to fill
 * would be noise on every demo login.
 */
export function useOutletPriceSetup(): OutletPriceSetupState {
	const { backed, workspace, isLoading } = useOutletWorkspace();

	const missing = useMemo<OutletPriceBucket[]>(() => {
		if (!backed || isLoading) return [];
		return outletPriceBucketsMissing(workspace?.drinkMenu ?? []);
	}, [backed, isLoading, workspace]);

	return {
		missing,
		needsPrices: missing.length > 0,
		isLoading: backed && isLoading,
	};
}
