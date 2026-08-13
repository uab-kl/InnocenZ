import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

// The /api/v1/pr "personnel" records (main.pr) — distinct from services/pr,
// which lists user accounts holding the "pr" role via /user.

export interface PrPersonnelPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

/**
 * Comcard / identity fields the backend folds in from the PR's linked user
 * account — the same source the admin PR screen reads, so both screens agree.
 * Null when the PR has no linked user account or no profile row yet.
 */
export interface PrPersonnelProfile {
	profileImage: string | null;
	gender: string | null;
	race: string | null;
	/** ISO date, `YYYY-MM-DD`. */
	dob: string | null;
	nationality: string | null;
	/** Spoken languages the PR set on their own profile, e.g. ['English','Hokkien']. */
	languages: string[] | null;
	portfolioPhotos: string[] | null;
	/** Saved auto-generated photo comcard path (`user_profile.comcard_image`). */
	comcardImage: string | null;
	comcardHeightCm: number | null;
	comcardWeightKg: number | null;
}

/**
 * How the PR's OWN agency grades them, from the `agency_pr` link row (0089).
 * Distinct from `PrPersonnelProfile`, which is the person: a PR on two rosters
 * can be graded differently by each agency. Null when no link row exists yet.
 */
export interface PrPersonnelRoster {
	place: string | null;
	yearsExp: number | null;
	/** 'A' | 'B' | 'C'. */
	kpiTier: string | null;
	/** 'basic' | 'commission_only'. */
	payClass: string | null;
}

/**
 * Live performance figures the backend derives from THIS agency's
 * `shift_assignment` and `payment_voucher` rows — never stored, never editable.
 *
 * `attendancePct` is null when the PR has no concluded shift yet, which is a
 * different fact from 0% and must render as an em-dash: a PR who has never been
 * scheduled has not missed anything. `totalPaidRm` counts only vouchers actually
 * marked `paid`, so it is money out the door, not money owed.
 *
 * Absent entirely for an outlet caller — a venue may not read agency payroll.
 */
export interface PrPersonnelStats {
	attendancePct: number | null;
	completedShifts: number;
	missedShifts: number;
	excusedShifts: number;
	totalPaidRm: number;
}

export interface PrPersonnel {
	id: string;
	agencyId: string;
	userId: string | null;
	name: string;
	nickname: string | null;
	// tier/status are backend enums; kept as strings here since the roster read
	// path only displays them.
	tier: string | null;
	status: string;
	phone: string | null;
	email: string | null;
	icNo: string | null;
	// Present on the read paths (list / get-by-id); absent on create/update
	// responses, which return the bare `pr` row.
	profile?: PrPersonnelProfile | null;
	/** Present on the read paths only, same as `profile`. */
	roster?: PrPersonnelRoster | null;
	/** Present on the LIST path, for agency and admin callers only. */
	stats?: PrPersonnelStats;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface PrPersonnelQueryParams {
	status?: string;
	tier?: string;
	name?: string;
	// Admin-only; agency callers are pinned to their own agency server-side.
	agencyId?: string;
	page?: number;
	pageSize?: number;
}

export interface PrPersonnelApiResponse {
	success: boolean;
	message: string;
	pagination: PrPersonnelPagination;
	data: PrPersonnel[];
}

export interface CreatePrPersonnelInput {
	agencyId?: string;
	userId?: string;
	name: string;
	nickname?: string;
	tier?: string;
	phone?: string;
	email?: string;
	icNo?: string;
}

// All fields optional; `status` (active/inactive/pending/suspended) is settable
// on update but not on create. Agency callers cannot move a PR between agencies.
export interface UpdatePrPersonnelInput {
	name?: string;
	nickname?: string;
	tier?: string;
	status?: string;
	phone?: string;
	email?: string;
	icNo?: string;
	/**
	 * Why a sign-up was declined; sent with `status: "inactive"`. Max 500 chars.
	 * The backend clears it on acceptance, so callers never send it back.
	 */
	rejectReason?: string;

	// Written to the linked account's `user_profile` — the same row the PR edits
	// in their own portal. 409s if the PR has no linked user account.
	race?: string;
	languages?: string[];
	/** ISO `YYYY-MM-DD`. */
	dob?: string;
	comcardHeightCm?: number;
	comcardWeightKg?: number;

	// Written to `agency_pr` — this agency's own grading of the PR.
	place?: string;
	yearsExp?: number;
	/** 'A' | 'B' | 'C'. */
	kpiTier?: string;
	/** 'basic' | 'commission_only'. */
	payClass?: string;
}

export async function fetchPrPersonnel(
	params: PrPersonnelQueryParams = {},
	onRefreshFail: () => void,
): Promise<PrPersonnelApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		status: params.status,
		tier: params.tier,
		name: params.name,
		agencyId: params.agencyId,
		page: params.page,
		pageSize: params.pageSize,
	});
	const response = await client.get<PrPersonnelApiResponse>(
		`/pr${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function createPrPersonnel(
	input: CreatePrPersonnelInput,
	onRefreshFail: () => void,
): Promise<PrPersonnel> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: PrPersonnel;
	}>("/pr", input);
	return response.data.data;
}

export async function updatePrPersonnel(
	id: string,
	input: UpdatePrPersonnelInput,
	onRefreshFail: () => void,
): Promise<PrPersonnel> {
	const client = getClient(onRefreshFail);
	const response = await client.put<{
		success: boolean;
		message: string;
		data: PrPersonnel;
	}>(`/pr/${id}`, input);
	return response.data.data;
}

export async function removePrPersonnel(
	id: string,
	onRefreshFail: () => void,
): Promise<void> {
	const client = getClient(onRefreshFail);
	await client.delete(`/pr/${id}`);
}
