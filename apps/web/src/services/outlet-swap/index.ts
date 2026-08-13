import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/**
 * `pending_pr` is the only live state — the PR has been asked and has not
 * answered. The other three are terminal: `approved` (the assignment moved),
 * `declined` (the PR said no), `cancelled` (the agency withdrew it).
 */
export type OutletSwapStatus =
	| "pending_pr"
	| "approved"
	| "declined"
	| "cancelled";

/** The bare row, as returned by the write endpoints. */
export interface OutletSwapRequest {
	id: string;
	assignmentId: string;
	fromShiftId: string;
	toShiftId: string;
	agencyId: string;
	agencyNote: string | null;
	prNote: string | null;
	status: OutletSwapStatus;
	respondedAt: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

/**
 * A swap with both ends resolved — what the list endpoints return. The context
 * is FK-joined server-side, so an outlet rename shows up here without the swap
 * row being rewritten.
 */
export interface OutletSwapRequestWithContext extends OutletSwapRequest {
	prId: string;
	prName: string | null;
	/** 'YYYY-MM-DD'. */
	fromShiftDate: string;
	fromSlot: string | null;
	fromOutletId: string;
	fromOutletName: string | null;
	toShiftDate: string;
	toSlot: string | null;
	toEventName: string | null;
	toOutletId: string;
	toOutletName: string | null;
}

/**
 * A candidate destination shift, with the live headcount that decides whether
 * approving it can succeed. `staffedCount >= quantity` means a request would be
 * refused on approval, so the picker should show it as full rather than offer
 * it. Counted from real assignments — `shift.filled` is never maintained.
 */
export interface OutletSwapTarget {
	shiftId: string;
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	outletId: string;
	outletName: string | null;
	quantity: number;
	staffedCount: number;
	/**
	 * The shift has room, but not for THIS PR's tier — approval would refuse it.
	 *
	 * A second, independent reason a request cannot succeed, and one headcount
	 * cannot express: a shift asking Tier III ×2 + Tier I ×2 at quantity 4 with 3
	 * staffed reads `3 < 4` and still refuses a 3rd Tier III. Optional so an older
	 * backend reads as "not blocked" rather than blocking every target.
	 */
	tierBlocked?: boolean;
}

export interface CreateOutletSwapInput {
	assignmentId: string;
	toShiftId: string;
	agencyNote?: string;
}

/** Swaps this agency raised (agency-scoped server-side). */
export async function fetchOutletSwaps(
	params: { assignmentId?: string; status?: OutletSwapStatus } = {},
	onRefreshFail: () => void,
): Promise<OutletSwapRequestWithContext[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		assignmentId: params.assignmentId,
		status: params.status,
	});
	const response = await client.get<{
		success: boolean;
		message: string;
		data: OutletSwapRequestWithContext[];
	}>(`/outlet-swap${queryString}`);
	return response.data.data ?? [];
}

/**
 * Where this assignment's PR could be moved on its own date: every other
 * staffable shift the agency runs that night, each with its live headcount.
 */
export async function fetchOutletSwapTargets(
	assignmentId: string,
	onRefreshFail: () => void,
): Promise<OutletSwapTarget[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({ assignmentId });
	const response = await client.get<{
		success: boolean;
		message: string;
		data: OutletSwapTarget[];
	}>(`/outlet-swap/targets${queryString}`);
	return response.data.data ?? [];
}

/**
 * Propose the move. Nothing on the roster changes here — the request sits at
 * `pending_pr` until the PR answers. 409 if the destination is already full or
 * this PR already has an unanswered request.
 */
export async function createOutletSwap(
	input: CreateOutletSwapInput,
	onRefreshFail: () => void,
): Promise<OutletSwapRequest> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: OutletSwapRequest;
	}>("/outlet-swap", input);
	return response.data.data;
}

/** Withdraw a request the PR has not answered yet. 409 once they have. */
export async function cancelOutletSwap(
	id: string,
	onRefreshFail: () => void,
): Promise<OutletSwapRequest> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: OutletSwapRequest;
	}>(`/outlet-swap/${id}/cancel`);
	return response.data.data;
}
