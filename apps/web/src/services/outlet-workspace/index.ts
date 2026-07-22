import { getClient } from "@/lib/axios-v1";

export type TierRateKind = "tier" | "commission_only";
export type PenaltyRuleType =
	| "min_shifts_per_week"
	| "max_mc_per_month"
	| "late_per_week";
export type PayClass = "basic" | "commissionOnly";

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

export type DrinkMenuCategory = "drink" | "service";

export interface WorkspaceDrinkMenuRow {
	id: string;
	workspaceId: string;
	slug: string;
	name: string;
	priceRm: string;
	category: DrinkMenuCategory;
	sortOrder: number;
}

export interface WorkspacePenaltyRuleRow {
	id: string;
	workspaceId: string;
	ruleType: PenaltyRuleType;
	enabled: boolean;
	appliesTo: PayClass[];
	fineRm: string;
	minShiftsPerWeek: number | null;
	maxMcPerMonth: number | null;
	finePerExcessRm: string | null;
	maxLatePerWeek: number | null;
	graceMinutes: number | null;
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
	penaltyRules: WorkspacePenaltyRuleRow[];
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

export interface SavePenaltyRuleInput {
	ruleType: PenaltyRuleType;
	enabled: boolean;
	appliesTo: PayClass[];
	fineRm: number;
	minShiftsPerWeek?: number | null;
	maxMcPerMonth?: number | null;
	finePerExcessRm?: number | null;
	maxLatePerWeek?: number | null;
	graceMinutes?: number | null;
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
	penaltyRules: SavePenaltyRuleInput[];
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
