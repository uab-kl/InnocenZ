import type { AdminUser } from "./types";

// Legal identity captured on the separate user_profile record. The /user list
// endpoint already nests this under `profile` (see withUserProfiles on the API).
export interface BackendUserProfile {
	fullName: string | null;
	nationality: string | null;
	gender: string | null;
	race: string | null;
	dob: string | null;
	portfolioPhotos: string[] | null;
	comcardImage: string | null;
	comcardHeightCm: number | null;
	comcardWeightKg: number | null;
	comcardBustCm: number | null;
	comcardWaistCm: number | null;
	comcardHipCm: number | null;
	idType: string | null;
	idNo: string | null;
	/**
	 * Whole years, DERIVED by the API from the IC and only then from `dob`
	 * (features/pr-personnel/ic-dob.ts). Age follows the IC — the owner's rule
	 * — so prefer this over recomputing it from `dob` on this side.
	 */
	age: number | null;
	/** Spoken languages the PR picked at sign-up, e.g. ["English","Hokkien"]. */
	languages: string[] | null;
	/**
	 * R2 object keys for the two ID scans the PR shoots at sign-up Step 4
	 * (passport = front only). `GET /user` has always sent these — they are
	 * dropped for OUTLET callers alone, admin and agency being privileged; see
	 * middlewares/redact-identity-docs.ts. Everything from here down was on the
	 * wire while this interface stayed at eleven properties, which is the whole
	 * reason the admin PR sheet could not show an IC photo: not a missing API,
	 * but a type that never named the field.
	 */
	idPhotoFront: string | null;
	idPhotoBack: string | null;
	addressLine1: string | null;
	addressLine2: string | null;
	city: string | null;
	postcode: string | null;
	state: string | null;
	country: string | null;
	bankName: string | null;
	bankAccountNo: string | null;
	/** Data-URL of the PR's drawn signature. Admin needs whether it EXISTS, not the ink. */
	signatureInk: string | null;
	verificationStatus: string | null;
	verifiedAt: string | null;
}

export interface BackendUser {
	id: string;
	/** `user.member_code` — INNPR0001 / INNADM0001 (0154). `GET /user` has always
	    sent it: it is not one of the PRIVATE_USER_FIELDS the API strips. */
	memberCode?: string | null;
	email: string | null;
	phoneNum: string | null;
	profileImage?: string | null;
	username: string;
	status: string;
	profile?: BackendUserProfile | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	/**
	 * WHO last changed this account, as a NAME.
	 *
	 * Resolved server-side by a LEFT JOIN from `updated_by` to the actor's user
	 * row (`user.repository.ts`), so the admin sheet can print a person rather
	 * than a uuid. Optional because a row written by a script has no actor to
	 * name — the column then stays null and the sheet says so.
	 */
	updatedByName?: string | null;
}

export function mapAdminUser(user: BackendUser): AdminUser {
	return {
		memberCode: user.memberCode ?? null,
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
