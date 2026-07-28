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

/** Google's confidence hint. ROOFTOP is a building; APPROXIMATE can be a suburb. */
export type GeocodePrecision =
	| "ROOFTOP"
	| "RANGE_INTERPOLATED"
	| "GEOMETRIC_CENTER"
	| "APPROXIMATE";

/** One address-lookup suggestion. Saves nothing until the operator commits it. */
export interface GeocodeCandidate {
	formattedAddress: string;
	lat: number;
	lng: number;
	precision: GeocodePrecision;
	placeId: string;
}

export interface GeocodeCandidatesApiResponse {
	success: boolean;
	message: string;
	data: GeocodeCandidate[];
}

/** The by-id lookup echoes the address it searched, so the operator can see it. */
export interface OutletGeocodeApiResponse {
	success: boolean;
	message: string;
	data: {
		query: string;
		candidates: GeocodeCandidate[];
	};
}

/** Mirrors UpdateGeoFenceSchema: radius is metres, 10–1000, server default 50. */
export interface GeoFencePayload {
	lat: number;
	lng: number;
	geoFenceRadius?: number;
}

export interface OutletsQueryParams {
	name?: string;
	status?: OutletStatus;
	onboardedByAgencyId?: string;
	page?: number;
	pageSize?: number;
}
