export interface PrAgencyRef {
	id: string;

	name: string;

	/** The agency’s member-id stem, INNATAGY — what the roster cell prints beside
	    the name. Null until an id has been minted at that agency. */
	code: string | null;

	/**
	 * The AGENCY's own status. A PR keeps her membership after an admin
	 * deactivates the agency — it is her history — so the row has to say the
	 * other side is switched off rather than showing a plain "Linked".
	 */
	status?: string | null;
}

export interface PrUser {
	/** Human-readable platform id — INNPR0001. ONE global sequence: a PR keeps the
	    same id across every agency they join, unlike an operator, whose id is
	    minted per organisation. */
	memberCode: string | null;

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

	comcardBustCm: number | null;

	comcardWaistCm: number | null;

	comcardHipCm: number | null;

	/**
	 * Whole years as the API derived them — from the IC when it encodes a date,
	 * else from `dob`. Null when the account has neither.
	 */
	age: number | null;

	/** Languages picked at sign-up Step 1. Empty array, never null, so callers can map it. */
	languages: string[];

	/**
	 * The two ID scans from sign-up Step 4, as R2 object keys — run them through
	 * `apiAssetUrl` before putting them in a `src`. Back is null for a passport,
	 * which is captured as a single page.
	 */
	idPhotoFront: string | null;

	idPhotoBack: string | null;

	/** Home address, sign-up Step 2. */
	addressLine1: string | null;

	addressLine2: string | null;

	city: string | null;

	postcode: string | null;

	state: string | null;

	country: string | null;

	bankName: string | null;

	bankAccountNo: string | null;

	/**
	 * Whether a drawn signature is on file — deliberately a boolean and not the
	 * ink. The stored value is a full data-URL, and an admin list has no use for
	 * a forgeable artefact it would then carry in memory for every row on screen.
	 */
	hasSignature: boolean;

	/** `draft` | `pending` | `verified` | `rejected` — the profile's own review state. */
	verificationStatus: string | null;

	status: string;

	agencies: PrAgencyRef[];

	createdAt: string;

	updatedAt: string;

	createdBy: string;

	updatedBy: string;
	/**
	 * WHO last switched this record off, by NAME — resolved server-side from
	 * `updatedBy` through a join on `user`, never stored as a column. Null when
	 * the actor was `'system'` or their account no longer exists.
	 *
	 * Optional because it is added by the server projection rather than by any
	 * caller here: an older cached response simply lacks it, and the archive
	 * screen renders its own fallback. `updatedBy` beside it keeps the raw id.
	 */
	updatedByName?: string | null;
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
