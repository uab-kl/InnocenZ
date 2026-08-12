import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

export type ShiftAssignmentStatus =
	| "assigned"
	| "confirmed"
	| "completed"
	| "no_show"
	| "cancelled"
	// PR MC/leave flow: pending awaits the agency decision below; approved is an
	// excused absence (no penalty). Reject returns the row to "assigned".
	| "leave_pending"
	| "leave_approved";

export interface ShiftAssignmentPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface ShiftAssignment {
	id: string;
	agencyId: string;
	shiftId: string;
	prId: string;
	status: ShiftAssignmentStatus;
	// numeric(12,2) is serialized as a string by the backend.
	payAmount: string;
	checkInAt: string | null;
	checkOutAt: string | null;
	// The GPS fix the PR's phone attached to each stamp, as verified and stored
	// by the server (apps/backend .../check-in-geofence.ts). Null on rows stamped
	// before geofencing shipped, and on outlets that have no map pin to fence
	// against. `checkInDistanceM` is the SERVER's own haversine result, never the
	// phone's claim — which is why the agency portal may render it as evidence.
	// numeric(10,8)/(11,8) are serialized as strings, same as payAmount.
	checkInLat?: string | null;
	checkInLng?: string | null;
	checkInDistanceM?: number | null;
	checkInAccuracyM?: number | null;
	checkOutLat?: string | null;
	checkOutLng?: string | null;
	checkOutDistanceM?: number | null;
	checkOutAccuracyM?: number | null;
	notes: string | null;
	/**
	 * MC / medical-certificate photos the PR filed with a leave request
	 * (shift_assignment.leave_proof_photos jsonb). Null on rows that never
	 * requested leave; reviewed on the Approvals → MC/Leaves tab.
	 */
	leaveProofPhotos?: string[] | null;
	/**
	 * The agency's decision on that request (migration 0112). Read these, never
	 * `status`, to tell approved from rejected: a rejection reverts `status` to
	 * `assigned`, and the old `[Leave rejected]` note prefix is display text,
	 * not a record.
	 */
	leaveStatus?: "pending" | "approved" | "rejected" | null;
	leaveDecidedAt?: string | null;
	leaveDecidedBy?: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	// Joined shift/PR context. The LIST endpoint always returns these; getById
	// returns the bare row, so treat them as optional.
	prName?: string | null;
	outletId?: string;
	/** Venue name, joined from the outlet FK on the LIST endpoint only. */
	outletName?: string | null;
	/**
	 * Staffing agency's name, joined from the assignment's agency FK on the LIST
	 * endpoint only. An outlet cannot read `/agency`, so this is its one source
	 * for the name — see use-outlet-history.ts.
	 */
	agencyName?: string | null;
	shiftDate?: string;
	/**
	 * The shift's own window — "22:00 — 04:00". LIST endpoint only, like the
	 * joins above. Null on a shift with no slot recorded; absent entirely from a
	 * backend that has not been restarted since this was added.
	 */
	slot?: string | null;
	/** The outlet's name for the night, joined from the shift. */
	eventName?: string | null;
	/** `shift.event_kind` — 'normal' | 'special'. Never null in the database. */
	eventKind?: string | null;
}

export interface ShiftAssignmentsQueryParams {
	shiftId?: string;
	prId?: string;
	status?: ShiftAssignmentStatus;
	/**
	 * MC/leave decision filter — "pending" for the queue, "approved,rejected"
	 * for history. Not the same axis as `status`: a rejected request reverts to
	 * `assigned`, so `status` alone can never list rejections.
	 */
	leaveStatus?: string;
	// Admin-only; agency callers are pinned to their own agency server-side.
	agencyId?: string;
	page?: number;
	pageSize?: number;
}

export interface ShiftAssignmentsApiResponse {
	success: boolean;
	message: string;
	pagination: ShiftAssignmentPagination;
	data: ShiftAssignment[];
}

export interface CreateShiftAssignmentInput {
	shiftId: string;
	/** Temporary ops bridge id — still required by unique(shift, pr) until Phase C. */
	prId: string;
	/** Preferred identity key (dual-written on the assignment). */
	userId?: string;
	status?: ShiftAssignmentStatus;
	payAmount?: number;
	checkInAt?: string;
	checkOutAt?: string;
	notes?: string;
}

export interface UpdateShiftAssignmentInput {
	status?: ShiftAssignmentStatus;
	payAmount?: number;
	checkInAt?: string;
	checkOutAt?: string;
	notes?: string;
}

export async function fetchShiftAssignments(
	params: ShiftAssignmentsQueryParams = {},
	onRefreshFail: () => void,
): Promise<ShiftAssignmentsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		shiftId: params.shiftId,
		prId: params.prId,
		status: params.status,
		leaveStatus: params.leaveStatus,
		agencyId: params.agencyId,
		page: params.page,
		pageSize: params.pageSize,
	});
	const response = await client.get<ShiftAssignmentsApiResponse>(
		`/shift-assignment${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function createShiftAssignment(
	input: CreateShiftAssignmentInput,
	onRefreshFail: () => void,
): Promise<ShiftAssignment> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: ShiftAssignment;
	}>("/shift-assignment", input);
	return response.data.data;
}

export async function updateShiftAssignment(
	id: string,
	input: UpdateShiftAssignmentInput,
	onRefreshFail: () => void,
): Promise<ShiftAssignment> {
	const client = getClient(onRefreshFail);
	const response = await client.put<{
		success: boolean;
		message: string;
		data: ShiftAssignment;
	}>(`/shift-assignment/${id}`, input);
	return response.data.data;
}

/**
 * One released-but-unfilled slot (PR cancelled or had MC/leave approved on an
 * upcoming shift still below quantity) — the agency's backfill worklist row.
 */
export interface BackfillSlot {
	assignmentId: string;
	prId: string;
	prName: string;
	status: ShiftAssignmentStatus;
	notes: string | null;
	shiftId: string;
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	outletId: string;
	outletName: string | null;
	quantity: number;
	staffedCount: number;
}

/** One ranked replacement option for a released slot. */
export interface ReplacementCandidate {
	prId: string;
	userId?: string | null;
	prName: string;
	tier: string;
	timesAtOutlet: number;
}

/** The agency's backfill worklist (agency-scoped server-side). */
export async function fetchBackfillSlots(
	onRefreshFail: () => void,
): Promise<BackfillSlot[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: BackfillSlot[];
	}>("/shift-assignment/backfill");
	return response.data.data ?? [];
}

/**
 * Ranked replacement PRs for a released assignment: free that night, same
 * agency, active — released PR's tier first, then outlet experience. Assign
 * the pick via the normal createShiftAssignment.
 */
export async function fetchReplacementCandidates(
	assignmentId: string,
	onRefreshFail: () => void,
): Promise<ReplacementCandidate[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: ReplacementCandidate[];
	}>(`/shift-assignment/${assignmentId}/replacement-candidates`);
	return response.data.data ?? [];
}

/**
 * What one PR would earn on a shift, per the server's own wage resolver.
 *
 * An OUTCOME rather than a number, because the three cases mean different
 * things and must not render alike:
 * - `priced` — a day rate applies; `wage` is it.
 * - `commission_only` — correctly no day rate; this PR earns on commission.
 * - `unpriced` — this outlet never costed the PR's tier. Assigning is REFUSED by
 *   the server unless the agency names a payAmount, so this is a warning, not a
 *   zero.
 */
export interface TierWagePreview {
	shiftId: string;
	kind: "priced" | "commission_only" | "unpriced";
	/** Present only when kind === 'priced'. A DAILY figure, not hourly. */
	wage?: string;
	/** Present only when kind === 'unpriced' — the tier label that has no rate. */
	tierLabel?: string | null;
}

/**
 * Wage outcomes for one PR across several shifts, before assigning them.
 *
 * Batched into a single call on purpose: the server resolves a whole day in the
 * same two queries it would spend on one shift.
 *
 * Shifts outside the caller's agency are dropped by the server rather than
 * reported, so a missing shiftId in the reply means "not yours or not found" —
 * never assume a rate for one that is absent.
 */
export async function fetchWagePreview(
	prId: string,
	shiftIds: string[],
	onRefreshFail: () => void,
): Promise<TierWagePreview[]> {
	if (!prId || shiftIds.length === 0) return [];
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: TierWagePreview[];
	}>(
		`/shift-assignment/wage-preview${buildQueryParams({
			prId,
			shiftIds: shiftIds.join(","),
		})}`,
	);
	return response.data.data ?? [];
}

/**
 * Approve a PR's pending MC/leave request — the PR is excused from the shift
 * with no penalty (status leave_pending -> leave_approved). 400 unless the row
 * is currently leave_pending; agency callers are scoped server-side.
 */
export async function approveLeaveRequest(
	id: string,
	onRefreshFail: () => void,
): Promise<ShiftAssignment> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: ShiftAssignment;
	}>(`/shift-assignment/${id}/leave/approve`);
	return response.data.data;
}

/**
 * Reject a PR's pending MC/leave request — the row returns to "assigned" (the
 * PR stays on the shift); the reason keeps living on notes, prefixed
 * "[Leave rejected] " so the mobile app can surface the outcome.
 */
export async function rejectLeaveRequest(
	id: string,
	onRefreshFail: () => void,
): Promise<ShiftAssignment> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: ShiftAssignment;
	}>(`/shift-assignment/${id}/leave/reject`);
	return response.data.data;
}

/** The Mon–Sun payroll week a claim's shift falls in, computed server-side. */
export interface OvertimeWeek {
	weekStart: string;
	weekEnd: string;
}

/**
 * One overtime claim awaiting an agency decision.
 *
 * `amount` and `week` are computed by the SERVER, by the same functions the
 * approval itself uses. Render them; never re-derive either one here. A screen
 * that computed its own figure could show the agency one number and write a
 * different one onto the voucher, and the agency would have attested to the
 * number it saw.
 */
export interface PendingOvertimeClaim {
	assignmentId: string;
	prId: string;
	prName: string | null;
	shiftId: string;
	shiftDate: string;
	slot: string | null;
	outletName: string | null;
	overtimeMinutes: number | null;
	// numeric(12,2), serialized as a string — the sealed daily wage the hourly
	// overtime rate is derived from.
	payAmount: string | null;
	week: OvertimeWeek | null;
	amount: string;
}

/** What an approval returns: the money that landed, and where it landed. */
export interface OvertimeDecisionResult {
	message: string;
	voucherId?: string;
	amount?: string;
	week?: OvertimeWeek;
}

/**
 * Overtime claims this agency has not yet decided.
 *
 * Every row here is holding its own payroll week: an undecided claim blocks
 * that week's voucher from being sent, so this list doubles as the answer to
 * "why can't I send last week?".
 */
export async function fetchPendingOvertime(
	onRefreshFail: () => void,
): Promise<PendingOvertimeClaim[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: PendingOvertimeClaim[];
	}>("/shift-assignment/overtime/pending");
	return response.data.data ?? [];
}

/**
 * Approve or reject one overtime claim — the only thing that turns recorded
 * minutes into money.
 *
 * Approving writes an `ot` line onto the voucher for the week the shift was
 * WORKED (owner's rule, 31 Jul 2026), so the amount is frozen at the moment of
 * the decision. Rejecting records "decided, worth nothing" and writes no line;
 * either way the claim stops blocking its week.
 *
 * Refusals worth surfacing verbatim rather than flattening into one message:
 * 409 already-decided (someone else got there first, so re-fetch), 409
 * unpriceable (a commission-only PR has no daily wage to derive an hourly rate
 * from — the honest answer is not a 0.00 line), and the 400 line-date rule.
 */
export async function decideOvertimeClaim(
	assignmentId: string,
	decision: "approve" | "reject",
	onRefreshFail: () => void,
): Promise<OvertimeDecisionResult> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: {
			voucherId?: string;
			amount?: string;
			week?: OvertimeWeek;
		} | null;
	}>(`/shift-assignment/${assignmentId}/overtime`, { decision });
	return {
		message: response.data.message,
		voucherId: response.data.data?.voucherId,
		amount: response.data.data?.amount,
		week: response.data.data?.week,
	};
}

export async function removeShiftAssignment(
	id: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.delete<{ success: boolean; message: string }>(
		`/shift-assignment/${id}`,
	);
	return response.data;
}
