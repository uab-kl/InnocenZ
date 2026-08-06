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
	/** Portal codes from /auth/me (`admin` | `agency` | `outlet`). */
	portals: string[];
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
