import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

export type ShiftStatus = "draft" | "open" | "confirmed" | "sealed";
export type ShiftEventKind = "normal" | "special";

export interface ShiftPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface Shift {
	/**
	 * Seats taken across EVERY agency the shift was posted to, counted server-side.
	 *
	 * ⚠️ Prefer this over counting `/shift-assignment` rows. That list is scoped to
	 * the caller's own agency — correctly, one agency must not read another's
	 * roster — so counting it on a shift shared through `shift_agency` reports this
	 * agency's own contribution as the occupancy, and offers seats the other agency
	 * already filled. Optional so an older backend or a cached response degrades to
	 * the previous behaviour rather than reading as an empty shift.
	 */
	staffedCount?: number;
	/** The same count split by tier bucket — the per-tier quota has the same split-brain. */
	staffedBuckets?: Record<string, number>;
	id: string;
	agencyId: string;
	outletId: string;
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	eventKind: ShiftEventKind;
	/** Event template the shift was posted from (0128); null on blank posts. */
	templateId?: string | null;
	/** That template's cover picture (R2 key), joined server-side. */
	templateCoverImage?: string | null;
	languages: string | null;
	quantity: number;
	filled: number;
	preferredRating: number | null;
	// numeric(12,2) columns are serialized as strings by the backend.
	payPerHour: string;
	estimatedCost: string;
	liveSales: string;
	status: ShiftStatus;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	/**
	 * The tier MIX this shift asked for (`shift_pay_tier`), served by both the
	 * list and getById. Optional because a response cached from before the list
	 * carried it has none — and an EMPTY array is meaningful in its own right:
	 * the shift declared no mix, so any tier fits and only `quantity` binds.
	 */
	payTiers?: ShiftPayTierDemand[];
}

/**
 * One tier's requested headcount on a shift. `tier` is the outlet label
 * ('Tier I'..'Servant'); commission-only carries null and is keyed on `kind`.
 */
export interface ShiftPayTierDemand {
	kind: "tier" | "commission_only";
	tier: string | null;
	prCount: number;
	/**
	 * The RATES the shift declared for this tier. The backend has always sent these
	 * — the type simply stopped at the demand, so every outlet screen fell back to a
	 * synthesised rate ladder and drew percentages the shift never asked for.
	 * Optional because a shift with no overrides has no rows at all.
	 */
	wagePerHour?: string | number | null;
	drinkPct?: string | number | null;
	tipPct?: string | number | null;
	targetSalesRm?: string | number | null;
}

export interface ShiftsQueryParams {
	outletId?: string;
	status?: ShiftStatus;
	eventKind?: ShiftEventKind;
	fromDate?: string;
	toDate?: string;
	// Admin-only; agency callers are pinned to their own agency server-side.
	agencyId?: string;
	page?: number;
	pageSize?: number;
}

export interface ShiftsApiResponse {
	success: boolean;
	message: string;
	pagination: ShiftPagination;
	data: Shift[];
}

/**
 * One per-shift pay-tier override the outlet composes at post time — mirrors a
 * backend `shift_pay_tier` row. Numeric fields are sent as numbers; the backend
 * coerces them to its numeric(…) columns. `tier` carries the outlet label
 * ('Tier I'..'Servant') for ranked tiers, null for commission-only.
 */
export interface ShiftPayTierInput {
	kind?: "tier" | "commission_only";
	tier?: string | null;
	wagePerHour?: number | null;
	drinkPct?: number;
	happyHourDrinkPct?: number | null;
	tipPct?: number;
	otAfterHours?: number | null;
	targetSalesRm?: number | null;
	prCount?: number;
	sortOrder?: number;
}

export interface CreateShiftInput {
	agencyId?: string;
	/**
	 * Which of the outlet's APPROVED agencies this job goes to (0124).
	 *
	 * Shared fulfilment: every listed agency may send PRs to the same shift
	 * until the headcount is met. Omit or leave empty to reach all approved
	 * agencies — which is what the old single-agency behaviour meant back when a
	 * venue could only have one.
	 *
	 * Advisory: the server intersects this with the outlet's approved links, so
	 * naming an unapproved agency cannot create an invitation.
	 */
	agencyIds?: string[];
	outletId: string;
	shiftDate: string;
	slot?: string;
	eventName?: string;
	eventKind?: ShiftEventKind;
	/** The event template this shift was posted from (0128). */
	templateId?: string;
	languages?: string;
	quantity?: number;
	filled?: number;
	preferredRating?: number;
	payPerHour?: number;
	estimatedCost?: number;
	liveSales?: number;
	// Per-shift rate overrides (Post Job pay-tier rows). Omit to keep the outlet's
	// workspace defaults; an empty array clears any existing overrides on update.
	payTiers?: ShiftPayTierInput[];
}

export type UpdateShiftInput = Partial<CreateShiftInput> & {
	status?: ShiftStatus;
};

export async function fetchShifts(
	params: ShiftsQueryParams = {},
	onRefreshFail: () => void,
): Promise<ShiftsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		outletId: params.outletId,
		status: params.status,
		eventKind: params.eventKind,
		fromDate: params.fromDate,
		toDate: params.toDate,
		agencyId: params.agencyId,
		page: params.page,
		pageSize: params.pageSize,
	});
	const response = await client.get<ShiftsApiResponse>(`/shift${queryString}`);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function fetchShift(
	id: string,
	onRefreshFail: () => void,
): Promise<Shift> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: Shift;
	}>(`/shift/${id}`);
	return response.data.data;
}

export async function createShift(
	input: CreateShiftInput,
	onRefreshFail: () => void,
): Promise<Shift> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: Shift;
	}>("/shift", input);
	return response.data.data;
}

export async function updateShift(
	id: string,
	input: UpdateShiftInput,
	onRefreshFail: () => void,
): Promise<Shift> {
	const client = getClient(onRefreshFail);
	const response = await client.put<{
		success: boolean;
		message: string;
		data: Shift;
	}>(`/shift/${id}`, input);
	return response.data.data;
}

export async function removeShift(
	id: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.delete<{ success: boolean; message: string }>(
		`/shift/${id}`,
	);
	return response.data;
}
