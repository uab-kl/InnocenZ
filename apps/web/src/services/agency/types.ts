export type AgencyStatus =
	| "pending_review"
	| "active"
	| "inactive"
	| "suspended";

/**
 * Sub-roles of an agency portal operator. `pr` is deliberately absent — PRs are
 * not portal users, and their agency links live on agency_pr (see PrAgencyLink).
 */
/** `director` is view-only; `guarantor` stands in for the owner, at owner level. */
export type AgencyUserSubRole = "owner" | "finance" | "director" | "guarantor";

/**
 * Membership lifecycle (0125 added the departure states):
 * `leave_pending` = an approved PR asked to leave and awaits the agency;
 * `left` = departure approved — the row is kept as history. A REJECTED
 * departure returns to `approved` with rejectReason prefixed "[Leave rejected] ".
 */
export type AgencyPrApproveStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "leave_pending"
	| "left";

/**
 * Result of a roster broadcast. `sent` and `requested` are always equal on a
 * 2xx — the server refuses partial sends rather than reporting them — but both
 * are carried so a caller can show the count it actually delivered instead of
 * the count it hoped for.
 */
export interface BroadcastToPrsApiResponse {
	success: boolean;
	message: string;
	data: { sent: number; requested: number } | null;
}

/** Which agency a PR user account is under — one row per (agency, user). */
export interface PrAgencyLink {
	/** Operational pr row when present; null if account-only membership. */
	prId: string | null;
	userId: string;
	agencyId: string;
	agencyName: string;
	agencyCode: string;
	/** Stem of that agency’s member ids — `AT` gives INNATAGY0001. Shown in place
	    of `agencyCode`, which numbers the organisation, not a person. */
	memberCodePrefix?: string | null;
	/**
	 * The counterpart organisation's OWN status, not the link's. `inactive`
	 * means an admin deactivated it: the relationship stands, but nobody there
	 * can sign in to act on it, so every surface showing this link has to say so.
	 */
	agencyStatus?: string | null;
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
	/**
	 * ISO `YYYY-MM-DD`. There is no `dob` column to trust directly: the server
	 * sends the date the PR's IC encodes when it has one, else the stored value.
	 */
	dob?: string | null;
	/**
	 * Whole years, DERIVED server-side from the IC. Render this — do NOT compute
	 * from `dob`. This field's absence is what left the Approvals screen doing
	 * its own sum and printing a different age from the comcard beside it.
	 * Optional so an older backend reads as "unknown" rather than 0.
	 */
	age?: number | null;
	portfolioPhotos?: (string | null)[] | null;
	/** IC scans from sign-up — only sent by the gated, agency-scoped PR route. */
	idPhotoFront?: string | null;
	idPhotoBack?: string | null;
	comcardImage?: string | null;
	comcardHeightCm?: number | null;
	comcardWeightKg?: number | null;
}

export interface Agency {
	id: string;
	name: string;
	agencyCode: string;
	/** Licence to trade — asked at sign-up, stored on the agency row since 0156.
	    Null for every agency registered before the question existed. */
	businessLicense?: string | null;
	/** The pre-2019 registration number, shown in brackets after the new one. */
	registrationNoOld?: string | null;
	/** The letters this agency’s member ids are built from — `AT` gives
	    INNATAGY0001. Null until an id has been minted here (0154). NOT the same
	    thing as `agencyCode`, which is a random six-digit org number. */
	memberCodePrefix?: string | null;
	ssmNo: string;
	contactName: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	logoImage?: string | null;
	addressLine1?: string | null;
	addressLine2?: string | null;
	city?: string | null;
	postcode?: string | null;
	state?: string | null;
	country?: string | null;
	status: AgencyStatus;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface AgencyMember {
	/** Human-readable id for THIS membership — INNATAGY0001. Null only for a row
	    the backfill has not reached. */
	memberCode?: string | null;
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
	/** Organisation status (`pending_review` / `active` / …). */
	agencyStatus: string;
	subRole: AgencyUserSubRole;
	status: string;
	/** THIS membership’s own id — INNATAGY0001. */
	memberCode?: string | null;
}

/**
 * One row of the admin's cross-agency "Team members" list —
 * `GET /agency/team-members`. The membership, the person, and the agency it
 * belongs to, which is what makes it readable outside any one agency.
 */
export interface AgencyTeamMember {
	/** Human-readable id for THIS membership — INNATAGY0001. Null only for a row
	    the backfill has not reached. */
	memberCode?: string | null;
	id: string;
	agencyId: string;
	userId: string;
	/** Derived from RBAC, not a column — see the repository's note. */
	subRole: AgencyUserSubRole;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	username?: string;
	email?: string | null;
	phoneNum?: string | null;
	agencyName: string;
	agencyCode: string;
	agencyStatus: string;
}

export interface AgencyTeamMembersApiResponse {
	success: boolean;
	message: string;
	data: AgencyTeamMember[];
	pagination: AgencyPagination;
}

/** Shared by both team-member lists. `status: "all"` means do not filter. */
export interface TeamMembersQueryParams {
	/** Narrow to ONE organisation — the deep link from its Team tab. */
	orgId?: string;
	page?: number;
	pageSize?: number;
	search?: string;
	status?: string;
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
