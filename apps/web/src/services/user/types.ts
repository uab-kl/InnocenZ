/**
 * One person's account as `GET /user/:id` returns it.
 *
 * `profile` is the nested `user_profile` row and is null for anyone who never
 * created one — which is most ORG operators, since an outlet/agency invite only
 * ever collects an email. It is populated for PRs, who fill it during onboarding.
 *
 * ⚠️ The identity fields below reach an ADMIN caller unredacted;
 * `redactIdentityDocsForOutlet` blanks them for outlet callers only. Render them
 * on admin surfaces only.
 */
export interface UserProfileDetail {
	id: string;
	userId: string;
	fullName: string | null;
	nationality: string | null;
	gender: string | null;
	race: string | null;
	idType: string | null;
	idNo: string | null;
	dob: string | null;
	age: number | null;
	addressLine1: string | null;
	addressLine2: string | null;
	city: string | null;
	postcode: string | null;
	state: string | null;
	country: string | null;
	verificationStatus: string | null;
	verifiedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface UserDetail {
	id: string;
	email: string | null;
	phoneNum: string | null;
	profileImage: string | null;
	username: string;
	/** Account lifecycle: `active` | `inactive` | `blocked`. NOT the membership status. */
	status: string;
	/** BCP-47 tag the person chose (`en` / `zh`), or null if they never picked one. */
	preferredLocale: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	profile: UserProfileDetail | null;
	/** Bucket origin the API resolves object keys against. */
	r2PublicUrl?: string | null;
}

export interface UserDetailApiResponse {
	success: boolean;
	message: string;
	data: UserDetail | null;
}

/**
 * One granted portal role — `GET /rbac/user-role?userId=`.
 *
 * The whole `/rbac` router is mounted behind `requireAdmin` (router/v1.ts), so
 * this is readable from the ADMIN portal only; an agency or outlet token gets a
 * 403. Anything rendering it must therefore be admin-only too.
 */
export interface UserRoleGrant {
	id: string;
	roleName: string;
	portalId: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface UserRolesApiResponse {
	success: boolean;
	message: string;
	data: UserRoleGrant[];
}
