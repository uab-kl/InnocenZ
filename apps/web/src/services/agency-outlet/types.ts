/**
 * Mirrors `agency_outlet.approve_status` (0123, `ended` added by 0127).
 *
 * `ended` and `rejected` are NOT the same state and must never be collapsed
 * into one badge: rejected means the agency never agreed, ended means it did
 * and the arrangement is over. Both stop new work; only one of them is a
 * history worth showing when the venue comes back.
 */
export type AgencyOutletApproveStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "ended";

/** Which SIDE caused a transition (`agency_outlet_event.actor_side`). */
export type AgencyOutletActorSide = "outlet" | "agency" | "admin" | "system";

/** One agency an outlet is linked to — the outlet Settings view. */
export type OutletAgencyLink = {
	id: string;
	agencyId: string;
	agencyName: string;
	agencyCode: string;
	approveStatus: AgencyOutletApproveStatus;
	rejectReason: string | null;
	/**
	 * When this partnership last ended and which side ended it — read from the
	 * event log, never stored on the link row. Null if it has never ended.
	 *
	 * The side is what the copy turns on: "you ended this" and "they ended this"
	 * are the same status and completely different news.
	 */
	endedAt: string | null;
	endedBySide: AgencyOutletActorSide | null;
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
	/**
	 * THE RETURNING-PARTNER CONTEXT, derived from `agency_outlet_event`.
	 *
	 * A venue whose link was ended and then asked for again arrives back in the
	 * queue as plain `pending`, identical on the row to one this agency has never
	 * heard of — while the facts that settle the decision (we worked together for
	 * eight months; they left, or we did) sit unread in the log.
	 *
	 * All three are null for a partnership that has never ended.
	 */
	firstApprovedAt: string | null;
	endedAt: string | null;
	endedBySide: AgencyOutletActorSide | null;
	createdAt: string;
	updatedAt: string;
};

/** One transition on a link's timeline — `GET /links/:outletId/history`. */
export type AgencyOutletLinkEvent = {
	id: string;
	/** Null on the first event only: the link did not exist yet. */
	fromStatus: AgencyOutletApproveStatus | null;
	toStatus: AgencyOutletApproveStatus;
	actorSide: AgencyOutletActorSide;
	reason: string | null;
	createdAt: string;
	createdBy: string;
};

export type AgencyOutletLinkEventsApiResponse = {
	success: boolean;
	message: string;
	data: AgencyOutletLinkEvent[];
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
