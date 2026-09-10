/** One organisation this account actually works in (an ACTIVE membership). */
export interface UserOrganisation {
	kind: "agency" | "outlet";
	id: string;
	name: string;
	/** Backend lane on the membership row: owner | finance | director | … */
	subRole: string;
	/** This person's member id INSIDE this organisation — INNATAGY0001. */
	memberCode: string | null;
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
	readPermission: string[];
	createPermission: string[];
	updatePermission: string[];
	/** Stable module keys with granted types (C/R/U). */
	modulePermissions: Array<{
		moduleKey: string;
		moduleName: string;
		permissionType: "read" | "create" | "update";
	}>;
}
