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
	notes: string | null;
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
