import { getClient } from "@/lib/axios-v1";

export type PenaltyRuleType =
	| "min_shifts_per_week"
	| "max_mc_per_month"
	| "late_per_week"
	| "cancellation";
// Backend `numeric` columns round-trip as strings.
export interface AgencyPenaltyRuleRow {
	id: string;
	agencyId: string;
	ruleType: PenaltyRuleType;
	enabled: boolean;
	fineRm: string;
	minShiftsPerWeek: number | null;
	maxMcPerMonth: number | null;
	finePerExcessRm: string | null;
	maxLatePerWeek: number | null;
	graceMinutes: number | null;
	freeCancelHours: number | null;
	shortNoticeHours: number | null;
	shortNoticePct: number | null;
	lateCancelPct: number | null;
}

export interface AgencyPenaltyRulesApiResponse {
	success: boolean;
	message: string;
	data: AgencyPenaltyRuleRow[] | null;
}

// Save payload — numbers (the backend coerces + serializes to numeric strings).
export interface SavePenaltyRuleInput {
	ruleType: PenaltyRuleType;
	enabled: boolean;
	fineRm: number;
	minShiftsPerWeek?: number | null;
	maxMcPerMonth?: number | null;
	finePerExcessRm?: number | null;
	maxLatePerWeek?: number | null;
	graceMinutes?: number | null;
	freeCancelHours?: number | null;
	shortNoticeHours?: number | null;
	shortNoticePct?: number | null;
	lateCancelPct?: number | null;
}

export async function fetchAgencyPenaltyRules(
	agencyId: string,
	onRefreshFail: () => void,
): Promise<AgencyPenaltyRulesApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<AgencyPenaltyRulesApiResponse>(
		`/agency/${agencyId}/penalty-rules`,
	);
	return response.data;
}

export async function saveAgencyPenaltyRules(
	agencyId: string,
	penaltyRules: SavePenaltyRuleInput[],
	onRefreshFail: () => void,
): Promise<AgencyPenaltyRulesApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<AgencyPenaltyRulesApiResponse>(
		`/agency/${agencyId}/penalty-rules`,
		{ penaltyRules },
	);
	return response.data;
}
