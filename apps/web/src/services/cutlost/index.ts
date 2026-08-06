import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/**
 * Cut-loss: the outlet asks to spend less on a shift, the agency decides.
 *
 * `pending` is the only live state. `approved` is what actually releases people
 * — a pending request has never touched a roster row — and `rejected` is
 * terminal with the agency's reason on it.
 */
export type CutlostRequestStatus = "pending" | "approved" | "rejected";
export type CutlostRequestKind = "release_prs" | "cut_slots" | "best_effort";

/** One PR a release names, resolved server-side through the assignment FK. */
export interface CutlostReleasedAssignment {
	assignmentId: string;
	prId: string;
	prName: string | null;
	/** What the release sealed. Null until the row is actually closed. */
	payAmount: string | null;
	status: string;
}

/**
 * A request with its venue/shift context FK-joined server-side, so an outlet
 * rename or a shift edit shows up here without the request row being rewritten.
 */
export interface CutlostRequestWithContext {
	id: string;
	shiftId: string;
	kind: CutlostRequestKind;
	status: CutlostRequestStatus;
	slotsCut: number | null;
	/** numeric(12,2) as a string — what the OUTLET was shown, frozen. */
	estimatedSavings: string;
	rationale: string[] | null;
	declineReason: string | null;
	decidedAt: string | null;
	decidedBy: string | null;
	createdAt: string;
	updatedAt: string;
	outletId: string;
	outletName: string | null;
	agencyId: string;
	/** 'YYYY-MM-DD'. */
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	releasedAssignments: CutlostReleasedAssignment[];
}

export interface CreateCutlostRequestInput {
	shiftId: string;
	kind: CutlostRequestKind;
	/**
	 * The PRs to release, by user id. The server resolves these to assignments
	 * on `shiftId` — a PR holds at most one per shift — and refuses any that is
	 * not on it, which is also the scope check.
	 */
	prIds?: string[];
	slotsCut?: number;
	/** What the outlet was shown, so both parties approve ONE figure. */
	estimatedSavings?: number;
	rationale?: string[];
}

/** One released row's outcome, as the decision endpoint reports it. */
export interface CutlostReleaseOutcome {
	assignmentId: string;
	/**
	 * `released` sealed a pro-rated wage; `stood_down_before_start` cancelled a
	 * PR who had not checked in (no hours to pro-rate); `already_closed` and
	 * `missing` are stale rows, reported rather than thrown so one bad entry
	 * cannot leave an approved plan half-applied.
	 */
	outcome: string;
	payAmount?: string | null;
}

export async function listCutlostRequests(
	params: { status?: CutlostRequestStatus; shiftId?: string },
	onAuthFail: () => void,
): Promise<CutlostRequestWithContext[]> {
	const client = getClient(onAuthFail);
	const { data } = await client.get(`/cutlost${buildQueryParams(params)}`);
	return data?.data ?? [];
}

/** Outlet-only. The agency is notified; nothing is released until it approves. */
export async function createCutlostRequest(
	input: CreateCutlostRequestInput,
	onAuthFail: () => void,
): Promise<CutlostRequestWithContext> {
	const client = getClient(onAuthFail);
	const { data } = await client.post("/cutlost", input);
	return data?.data;
}

/**
 * Agency-only — the venue that asked cannot approve its own ask.
 *
 * Approving releases the named PRs through the same seal a PR's own check-out
 * uses, so each is paid pro-rata for the minutes actually worked.
 */
export async function decideCutlostRequest(
	id: string,
	decision: "approve" | "reject",
	onAuthFail: () => void,
	reason?: string,
): Promise<{
	request: CutlostRequestWithContext;
	released: CutlostReleaseOutcome[];
}> {
	const client = getClient(onAuthFail);
	const { data } = await client.post(`/cutlost/${id}/decision`, {
		decision,
		...(reason ? { reason } : {}),
	});
	return data?.data;
}
