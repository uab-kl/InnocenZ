export interface User {
	id: string;
	email: string;
	displayName: string;
	contactNo: string;
	isActive: boolean;
	/** Backend path e.g. /img/users/<id>.png — resolve with apiAssetUrl for display. */
	profileImage?: string | null;
	roles: string[];
	readPermission: string[];
	createPermission: string[];
	updatePermission: string[];
}
