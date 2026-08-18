/** Mirrors `agency_outlet.approve_status` (migration 0123). */
export type AgencyOutletApproveStatus = "pending" | "approved" | "rejected";

/** One agency an outlet is linked to — the outlet Settings view. */
export type OutletAgencyLink = {
	id: string;
	agencyId: string;
	agencyName: string;
	agencyCode: string;
	approveStatus: AgencyOutletApproveStatus;
	rejectReason: string | null;
};

/** One venue on an agency's linking queue — the Outlet-Linking tab view. */
export type AgencyOutletLink = {
	id: string;
	agencyId: string;
	outletId: string;
	outletName: string;
	approveStatus: AgencyOutletApproveStatus;
	rejectReason: string | null;
	city: string | null;
	state: string | null;
	addressLine1: string | null;
	addressLine2: string | null;
	postcode: string | null;
	country: string | null;
	/** R2 object key — resolve through `OutletLogoTile`, never render raw. */
	logoImage: string | null;
	/**
	 * The VENUE's own lifecycle state, NOT this link's `approveStatus`. A venue
	 * still at `pending_review` has not cleared platform review, which the agency
	 * should see before agreeing to staff it.
	 */
	outletStatus: string;
	ssmNo: string | null;
	businessLicense: string | null;
	/**
	 * True when this link came from migration 0123's backfill rather than from a
	 * venue actually asking — i.e. a long-standing partner, not a new request.
	 * The tab uses it to avoid presenting existing relationships as fresh work.
	 */
	fromOnboarding: boolean;
	createdAt: string;
	updatedAt: string;
};

export type OutletAgencyLinksApiResponse = {
	success: boolean;
	message: string;
	data: OutletAgencyLink[];
};

export type AgencyOutletLinksApiResponse = {
	success: boolean;
	message: string;
	data: AgencyOutletLink[];
};

/** One pickable agency — the narrow projection an outlet is allowed to see. */
export type AgencyDirectoryEntry = {
	id: string;
	name: string;
	agencyCode: string;
};

export type AgencyDirectoryApiResponse = {
	success: boolean;
	message: string;
	data: AgencyDirectoryEntry[];
};
