/**
 * One organisation this account belongs to — INCLUDING ones it can no longer
 * enter, which is the whole point of `enterable`.
 *
 * This used to be "an ACTIVE membership" and the server filtered the rest out.
 * A member deactivated at one organisation simply saw it disappear, which is
 * indistinguishable from never having been there. Deactivation is
 * per-organisation, so the other organisations keep working and the user has
 * to be able to tell which one went away and why.
 */
export interface UserOrganisation {
	kind: "agency" | "outlet";
	id: string;
	name: string;
	/** Backend lane on the membership row: owner | finance | director | … */
	subRole: string;
	/** This person's member id INSIDE this organisation — INNATAGY0001. */
	memberCode: string | null;
	/**
	 * The organisation's own logo.
	 *
	 * Somebody who works in three places is picking between BRANDS, not
	 * reading a list of names, and every card used to carry the same generic
	 * building glyph. Null is normal — an organisation that has not uploaded
	 * one falls back to that glyph rather than to a broken image.
	 */
	logoImage?: string | null;
	/** THIS PERSON's standing here: "active" once deactivated becomes "inactive". */
	membershipStatus: string;
	/** The ORGANISATION's own standing: active | pending_review | suspended | inactive. */
	orgStatus: string;
	/**
	 * May they actually work here right now? Computed on the SERVER from both
	 * statuses above, using the login gate's own deny rule — never re-derived
	 * on the client, so the picker can never disagree with the door.
	 *
	 * ⚠️ Not the same as "both statuses are active": a `pending_review` or
	 * `suspended` organisation is still enterable, with a profile-only session.
	 */
	enterable: boolean;
}

export interface User {
	id: string;
	email: string;
	/** `user.username` from the DB (PIC / display name for org accounts). */
	username: string;
	displayName: string;
	contactNo: string;
	isActive: boolean;
	/** Backend path e.g. /img/users/<id>.png — resolve with apiAssetUrl for display. */
	profileImage?: string | null;
	roles: string[];
	/**
	 * UI language saved on the ACCOUNT (migration 0122) — `en` | `zh`
	 * (Simplified), or null when this person has never picked one. Read by
	 * `PortalLocaleProvider`, which is what makes the choice survive a sign-out
	 * and follow the account to another browser.
	 */
	preferredLocale?: string | null;
	/** Portal codes from /auth/me (`admin` | `agency` | `outlet`). */
	portals: string[];
	/**
	 * WHICH agencies and venues this person works in — active memberships only.
	 *
	 * `portals` says what KIND of portal they may open and stops there, so it
	 * cannot answer "which agency?" for somebody who staffs two. This list is
	 * what the chooser counts: one goes straight through, two or more are asked.
	 * Empty for an admin, who belongs to no organisation.
	 */
	organisations: UserOrganisation[];
	/** Requests that were declined — an ANSWER, not a place they belong. */
	declinedRequests: { kind: "agency" | "outlet"; name: string }[];
	readPermission: string[];
	createPermission: string[];
	updatePermission: string[];
	/** Stable module keys with granted types (C/R/U). */
	modulePermissions: Array<{
		moduleKey: string;
		moduleName: string;
		permissionType: "read" | "create" | "update";
		/**
		 * WHICH console granted it. `settings`, `dashboard` and `history` are a
		 * separate module row per portal, so the key alone cannot tell an agency
		 * grant from an outlet one. `null` = unknown (older server, or a module
		 * with no portal) and is treated as "applies anywhere", which is how
		 * this behaved before the field existed.
		 */
		portalCode?: string | null;
	}>;
}
