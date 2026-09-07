export type OutletStatus =
	| "pending_review"
	| "active"
	| "inactive"
	| "suspended";

/** `director` is view-only; `guarantor` stands in for the owner, at owner level. */
export type OutletMemberSubRole =
	| "owner"
	| "finance"
	| "operations_head"
	| "director"
	| "guarantor";

export interface Outlet {
	id: string;
	name: string;
	logoImage: string | null;
	addressLine1: string | null;
	addressLine2: string | null;
	city: string | null;
	postcode: string | null;
	state: string | null;
	country: string | null;
	businessLicense: string | null;
	ssmNo: string | null;
	lat: string | null;
	lng: string | null;
	geoFenceRadius: number | null;
	status: OutletStatus;
	/**
	 * ⚠️ HISTORY ONLY — present because the API still returns the column, not
	 * because anything should read it. Null for every venue registered after the
	 * multi-agency cutover. "Which agencies may staff this venue" is
	 * `fetchOutletAgencyLinks` / `fetchMyAgencyLinks`.
	 */
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

/** Single-member responses: add / update. */
export interface OutletMemberApiResponse {
	success: boolean;
	message: string;
	data: OutletMember;
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
	/** Organisation status (`pending_review` / `active` / …). */
	outletStatus: string;
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
/**
 * The six address columns a match maps onto — see the backend's
 * `addressPartsFromComponents`. Committing a pin found by free-text search
 * writes these too, so the venue's address and its fence never describe two
 * different places.
 */
export interface GeocodeAddressParts {
	addressLine1: string;
	addressLine2: string;
	city: string;
	postcode: string;
	state: string;
	country: string;
}

export interface GeocodeCandidate {
	formattedAddress: string;
	lat: number;
	lng: number;
	precision: GeocodePrecision;
	placeId: string;
	/** Absent from a backend older than the address-sync change. */
	components?: GeocodeAddressParts;
}

export interface GeocodeCandidatesApiResponse {
	success: boolean;
	message: string;
	data: GeocodeCandidate[];
}

/**
 * The by-id lookup echoes the address it searched, so the operator can see it.
 *
 * `data` is null on every non-2xx the controller returns (400 no address, 404
 * unknown outlet, 503 no geocoder key, 500) — axios rejects those before a
 * caller sees them, but the type stays honest about it.
 */
export interface OutletGeocodeApiResponse {
	success: boolean;
	message: string;
	data: {
		query: string;
		candidates: GeocodeCandidate[];
	} | null;
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
	/**
	 * VISIBILITY — venues this agency is APPROVED to staff (`agency_outlet`).
	 * The agency portal uses this. The old `onboardedByAgencyId` filter is gone —
	 * it could only ever return the one venue an agency originally signed up.
	 */
	linkedToAgencyId?: string;
	page?: number;
	pageSize?: number;
}

// A second copy of the geocode candidate + response types arrived on the same
// merge. The candidate was field-for-field GeocodeCandidate above, and the
// duplicate response interface would not have compiled. Its one improvement is
// kept on the surviving declaration: `data` really is nullable.
