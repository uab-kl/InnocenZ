export interface PrAgencyRef {
	id: string;

	name: string;

	code: string;
}

export interface PrUser {
	id: string;

	email: string;

	phoneNum: string;

	profileImage: string | null;

	displayName: string;

	legalName: string;

	idType: string | null;

	idNo: string | null;

	gender: string | null;

	race: string | null;

	dob: string | null;

	nationality: string | null;

	portfolioPhotos: string[];

	comcardHeightCm: number | null;

	comcardWeightKg: number | null;

	status: string;

	agencies: PrAgencyRef[];

	createdAt: string;

	updatedAt: string;

	createdBy: string;

	updatedBy: string;
}

export interface PrPagination {
	page: number;

	pageSize: number;

	totalCount: number;

	totalPages: number;

	hasNextPage: boolean;

	hasPrevPage: boolean;
}

export interface PrUsersApiResponse {
	success: boolean;

	message: string;

	data: PrUser[];

	pagination: PrPagination;
}

export interface PrUsersQueryParams {
	status?: string;

	/** Client-side filter after fetch enrichment (agency id). */

	agencyId?: string;

	search?: string;

	page?: number;

	pageSize?: number;
}
