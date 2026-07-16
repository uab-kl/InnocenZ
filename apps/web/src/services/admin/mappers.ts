import type { AdminUser } from "./types";

// Legal identity captured on the separate user_profile record. The /user list
// endpoint already nests this under `profile` (see withUserProfiles on the API).
export interface BackendUserProfile {
	firstName: string | null;
	lastName: string | null;
	idType: string | null;
	idNo: string | null;
}

export interface BackendUser {
	id: string;
	email: string | null;
	phoneNum: string | null;
	username: string;
	status: string;
	profile?: BackendUserProfile | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export function mapAdminUser(user: BackendUser): AdminUser {
	return {
		id: user.id,
		email: user.email ?? "",
		displayName: user.username,
		status: user.status,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
		createdBy: user.createdBy,
		updatedBy: user.updatedBy,
	};
}
