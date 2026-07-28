export type OutletStatus =
	| "pending_review"
	| "active"
	| "inactive"
	| "suspended";

export type OutletMemberSubRole = "owner" | "finance" | "operations_head";

export interface Outlet {
	id: string;
	name: string;
	logoImage: string | null;
	addressLine1: string | null;
	addressLine2: string | null;
	postcode: string | null;
	state: string | null;
	country: string | null;
	businessLicense: string | null;
	ssmNo: string | null;
	lat: string | null;
	lng: string | null;
	geoFenceRadius: number | null;
	status: OutletStatus;
	onboardedByAgencyId: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface OutletMember {
	id: string;
	outletId: string;
	userId: string;
	subRole: OutletMemberSubRole;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	username?: string;
	email?: string | null;
	phoneNum?: string | null;
}

export interface OutletPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface OutletsApiResponse {
	success: boolean;
	message: string;
	data: Outlet[];
	pagination: OutletPagination;
}

export interface OutletApiResponse {
	success: boolean;
	message: string;
	data: Outlet;
}

export interface OutletMembersApiResponse {
	success: boolean;
	message: string;
	data: OutletMember[];
}

/** One outlet membership joined to its outlet — resolves a signed-in operator's
 * own outlet + role at session start. */
export interface OutletMembership {
	membershipId: string;
	userId: string;
	outletId: string;
	outletName: string;
	subRole: OutletMemberSubRole;
	status: string;
}

export interface OutletMembershipsApiResponse {
	success: boolean;
	message: string;
	data: OutletMembership[];
}

export interface OutletsQueryParams {
	name?: string;
	status?: OutletStatus;
	onboardedByAgencyId?: string;
	page?: number;
	pageSize?: number;
}

/** One candidate pin from the address geocoder — a SUGGESTION, never saved. */
export interface OutletGeocodeCandidate {
	formattedAddress: string;
	lat: number;
	lng: number;
	/** ROOFTOP = exact building … APPROXIMATE = area guess. */
	precision:
		| "ROOFTOP"
		| "RANGE_INTERPOLATED"
		| "GEOMETRIC_CENTER"
		| "APPROXIMATE";
	placeId: string;
}

export interface OutletGeocodeApiResponse {
	success: boolean;
	message: string;
	data: { query: string; candidates: OutletGeocodeCandidate[] } | null;
}
