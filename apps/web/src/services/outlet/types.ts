export type OutletStatus =
	| "pending_review"
	| "active"
	| "inactive"
	| "suspended";

export type OutletMemberSubRole = "owner" | "finance" | "operations_head";

export interface Outlet {
	id: string;
	name: string;
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
	subscriptionId: string | null;
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

export interface OutletsQueryParams {
	name?: string;
	status?: OutletStatus;
	onboardedByAgencyId?: string;
	subscriptionId?: string;
	page?: number;
	pageSize?: number;
}
