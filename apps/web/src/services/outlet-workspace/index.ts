import { getClient } from "@/lib/axios-v1";

export type TierRateKind = "tier" | "commission_only";

// Backend `numeric` columns round-trip as strings.
export interface WorkspaceTierRateRow {
	id: string;
	workspaceId: string;
	kind: TierRateKind;
	tier: string | null;
	wagePerHour: string | null;
	drinkPct: string;
	happyHourDrinkPct: string | null;
	tipPct: string;
	otAfterHours: string | null;
	targetSalesRm: string | null;
	sortOrder: number;
}

/**
 * What a menu row is STORED as — three values, not the two the portal draws.
 *
 * `tip` is a money bucket: `shift-sale-from-receipts` files a `tip` line under
 * `tip_rm` and a `service` line under `service_sales_rm`. It renders inside
 * Service Entitlement (see `outletDrinkCategory`, which folds everything that
 * is not a drink into that list), but it must survive the round-trip as `tip` —
 * flattening it on the way back moved a venue's tips into service sales.
 */
export type DrinkMenuCategory = "drink" | "service" | "tip";

export interface WorkspaceDrinkMenuRow {
	id: string;
	workspaceId: string;
	slug: string;
	name: string;
	priceRm: string;
	category: DrinkMenuCategory;
	sortOrder: number;
}

export interface OutletWorkspaceRecord {
	id: string;
	outletId: string;
	basePayPerHour: string;
	drinkPct: string;
	tipPct: string;
	otAfterHours: string;
	perDrinkRm: string;
	happyHourStart: string;
	happyHourEnd: string;
	happyHourDrinkDiscountPct: number;
	createdAt: string;
	updatedAt: string;
	tierRates: WorkspaceTierRateRow[];
	drinkMenu: WorkspaceDrinkMenuRow[];
}

export interface OutletWorkspaceApiResponse {
	success: boolean;
	message: string;
	data: OutletWorkspaceRecord | null;
}

// Save payload — numbers (the backend coerces + serializes to numeric strings).
export interface SaveTierRateInput {
	kind: TierRateKind;
	tier?: string | null;
	wagePerHour?: number | null;
	drinkPct: number;
	happyHourDrinkPct?: number | null;
	tipPct: number;
	otAfterHours?: number | null;
	targetSalesRm?: number | null;
	sortOrder: number;
}

export interface SaveDrinkMenuInput {
	slug: string;
	name: string;
	priceRm: number;
	category: DrinkMenuCategory;
	sortOrder: number;
}

export interface SaveOutletWorkspaceInput {
	basePayPerHour: number;
	drinkPct: number;
	tipPct: number;
	otAfterHours: number;
	perDrinkRm: number;
	happyHourStart: string;
	happyHourEnd: string;
	happyHourDrinkDiscountPct: number;
	tierRates: SaveTierRateInput[];
	drinkMenu: SaveDrinkMenuInput[];
}

export async function fetchOutletWorkspace(
	outletId: string,
	onRefreshFail: () => void,
): Promise<OutletWorkspaceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<OutletWorkspaceApiResponse>(
		`/outlet-workspace/${outletId}`,
	);
	return response.data;
}

export async function saveOutletWorkspace(
	outletId: string,
	input: SaveOutletWorkspaceInput,
	onRefreshFail: () => void,
): Promise<OutletWorkspaceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<OutletWorkspaceApiResponse>(
		`/outlet-workspace/${outletId}`,
		input,
	);
	return response.data;
}
