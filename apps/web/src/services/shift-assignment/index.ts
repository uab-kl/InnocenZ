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
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	// Joined shift/PR context. The LIST endpoint always returns these; getById
	// returns the bare row, so treat them as optional.
	prName?: string | null;
	outletId?: string;
	shiftDate?: string;
}

export interface ShiftAssignmentsQueryParams {
	shiftId?: string;
	prId?: string;
	status?: ShiftAssignmentStatus;
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
	prId: string;
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
