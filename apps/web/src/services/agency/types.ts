export type AgencyStatus =
	| "pending_review"
	| "active"
	| "inactive"
	| "suspended";

export type AgencyMemberSubRole = "owner" | "finance" | "pr";

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
	subRole: AgencyMemberSubRole;
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
	subRole: AgencyMemberSubRole;
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
	subRole?: AgencyMemberSubRole;
	status?: string;
	search?: string;
}
