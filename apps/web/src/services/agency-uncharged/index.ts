import { getClient } from "@/lib/axios-v1";

/** One sealed-but-uncollected cancellation fee. Numerics arrive as strings. */
export interface UnchargedCancellation {
	assignmentId: string;
	prId: string | null;
	userId: string | null;
	prName: string | null;
	shiftDate: string | null;
	slot: string | null;
	outletName: string | null;
	dailyWageRm: string | null;
	feeRm: string | null;
	feePct: number | null;
	noticeHours: string | null;
	reason: string | null;
	cancelledAt: string | null;
}

/** One sealed-but-unbilled WEEKLY penalty (min shifts / MC cap / lateness). */
export interface UnchargedPenalty {
	chargeId: string;
	prId: string | null;
	prName: string | null;
	ruleType: string;
	weekStart: string;
	weekEnd: string;
	fineRm: string;
	detail: string;
	sealedAt: string | null;
}

export interface UnchargedResponse {
	success: boolean;
	message: string;
	data: {
		cancellations: UnchargedCancellation[];
		penalties: UnchargedPenalty[];
		cancellationsRm: string;
		penaltiesRm: string;
		totalRm: string;
		count: number;
	} | null;
}

export async function fetchAgencyUncharged(
	agencyId: string,
	onRefreshFail: () => void,
): Promise<UnchargedResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<UnchargedResponse>(
		`/agency/${agencyId}/uncharged`,
	);
	return response.data;
}

export async function markUnchargedCollected(
	agencyId: string,
	ids: { assignmentIds?: string[]; chargeIds?: string[] },
	voucherId: string | null,
	onRefreshFail: () => void,
): Promise<{
	success: boolean;
	message: string;
	data: { charged: number } | null;
}> {
	const client = getClient(onRefreshFail);
	const response = await client.post(
		`/agency/${agencyId}/uncharged/mark-charged`,
		{ ...ids, voucherId },
	);
	return response.data;
}

/** Accept a week's weekly breaches as owed — creates penalty_charge rows. */
export async function sealPenaltyWeek(
	agencyId: string,
	weekStart: string,
	weekEnd: string,
	onRefreshFail: () => void,
): Promise<{
	success: boolean;
	message: string;
	data: { sealed: number; evaluated: number } | null;
}> {
	const client = getClient(onRefreshFail);
	const response = await client.post(`/agency/${agencyId}/penalties/seal`, {
		weekStart,
		weekEnd,
	});
	return response.data;
}

/** One live breach for a week — a proposal, not yet a debt. */
export interface PenaltyProposal {
	prId: string;
	prName: string | null;
	ruleType: string;
	weekStart: string;
	weekEnd: string;
	fineRm: string;
	detail: string;
	/** true once the agency has recorded it as owed (penalty_charge exists). */
	sealed: boolean;
}

/**
 * Who is in breach this week, computed by the BACKEND.
 *
 * Manage PR used to evaluate this in the browser from `pr.shiftsThisWeek` and
 * friends — fields that exist only on demo PRs, so a real roster always showed
 * "No active penalties this week". One evaluator, server-side, is the fix.
 */
export async function fetchPenaltyProposals(
	agencyId: string,
	weekStart: string,
	weekEnd: string,
	onRefreshFail: () => void,
): Promise<{
	success: boolean;
	message: string;
	data: { proposals: PenaltyProposal[]; totalRm: string; count: number } | null;
}> {
	const client = getClient(onRefreshFail);
	const response = await client.get(
		`/agency/${agencyId}/penalty-proposals?weekStart=${weekStart}&weekEnd=${weekEnd}`,
	);
	return response.data;
}
