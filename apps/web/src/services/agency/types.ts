export type AgencyStatus =
	| "pending_review"
	| "active"
	| "inactive"
	| "suspended";

/**
 * Sub-roles of an agency portal operator. `pr` is deliberately absent — PRs are
 * not portal users, and their agency links live on agency_pr (see PrAgencyLink).
 */
export type AgencyUserSubRole = "owner" | "finance";

export type AgencyPrApproveStatus = "pending" | "approved" | "rejected";

/** Which agency a PR user account is under — one row per (agency, user). */
export interface PrAgencyLink {
	/** Operational pr row when present; null if account-only membership. */
	prId: string | null;
	userId: string;
	agencyId: string;
	agencyName: string;
	agencyCode: string;
	approveStatus: AgencyPrApproveStatus;
}

/** A PR on an agency's membership list (agency_pr keyed by user_id). */
export interface AgencyPr {
	/** agency_pr.id */
	id: string;
	prId: string | null;
	agencyId: string;
	userId: string;
	name: string;
	nickname: string | null;
	approveStatus: AgencyPrApproveStatus;
	tier?: string;
	rejectReason?: string | null;
	username: string | null;
	email: string | null;
	phoneNum: string | null;
	idNo?: string | null;
	createdAt?: string;
	updatedAt?: string;
	/**
	 * The PR's own `user_profile`, folded in by the same join that supplies
	 * `name` and `idNo` (see AgencyPrEnriched in agency-pr.repository.ts).
	 *
	 * These were served all along and simply not declared here, which is why the
	 * Approvals screen showed a PR with no languages, no photos and an invented
	 * 165cm/52kg/24y body while Manage PR — reading the SAME user_profile row
	 * through GET /pr — showed the real one. Photos are R2 OBJECT KEYS; resolve
	 * every one through `prPhotoSrc` / `apiAssetUrl`.
	 */
	profileImage?: string | null;
	race?: string | null;
	languages?: string[] | null;
	/** ISO `YYYY-MM-DD`. Age is DERIVED from this — there is no age column. */
	dob?: string | null;
	portfolioPhotos?: (string | null)[] | null;
	comcardImage?: string | null;
	comcardHeightCm?: number | null;
	comcardWeightKg?: number | null;
}

export interface Agency {
	id: string;
	name: string;
	agencyCode: string;
	ssmNo: string;
	contactName: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	status: AgencyStatus;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface AgencyMember {
	id: string;
	agencyId: string;
	userId: string;
	subRole: AgencyUserSubRole;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	username?: string;
	email?: string | null;
	phoneNum?: string | null;
}

export interface AgencyMembership {
	membershipId: string;
	userId: string;
	agencyId: string;
	agencyName: string;
	agencyCode: string;
	subRole: AgencyUserSubRole;
	status: string;
}

export interface AgencyPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface AgenciesApiResponse {
	success: boolean;
	message: string;
	data: Agency[];
	pagination: AgencyPagination;
}

export interface AgencyApiResponse {
	success: boolean;
	message: string;
	data: Agency;
}

export interface AgencyMembersApiResponse {
	success: boolean;
	message: string;
	data: AgencyMember[];
}

/** Single-member responses: add / update. */
export interface AgencyMemberApiResponse {
	success: boolean;
	message: string;
	data: AgencyMember;
}

export interface AgencyMembershipsApiResponse {
	success: boolean;
	message: string;
	data: AgencyMembership[];
}

export interface AgenciesQueryParams {
	name?: string;
	agencyCode?: string;
	status?: AgencyStatus;
	page?: number;
	pageSize?: number;
}

export interface AgencyMembersQueryParams {
	subRole?: AgencyUserSubRole;
	status?: string;
	search?: string;
}
