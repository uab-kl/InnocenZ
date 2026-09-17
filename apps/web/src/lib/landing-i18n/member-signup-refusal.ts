/**
 * THE REFUSALS OF `POST /auth/register-member`, IN THE READER'S LANGUAGE.
 *
 * The member sign-up page is a signed-out LANDING page — its copy and its
 * language pick come from `landing-i18n`, not the portal dictionary — but it
 * printed the server's English sentence as-is, so a 中文 reader who hit a
 * taken phone number read "That phone number is already used by another
 * account" in English at exactly the moment something went wrong.
 *
 * Every key below is a sentence the backend really sends on this route, read
 * from the code on 17 Sep 2026 — not a guess at what it might say:
 *   - org-member-invite.controller.ts `registerMember`: the two 409s
 *     (`REGISTER_MEMBER_EMAIL_TAKEN` / `REGISTER_MEMBER_PHONE_TAKEN`), the 404
 *     for an organisation that cannot be joined, the 400 for an unreadable
 *     `join`, and the `Error.INTERNAL_SERVER_ERROR` catch-all;
 *   - schema/outlet.schema.ts `RegisterOrgMemberSchema`: the first zod issue's
 *     message is what a 400 carries;
 *   - middlewares/rate-limit.ts `registerLimiter`;
 *   - auth.routes.ts passes multer's `err.message` through: the file filter in
 *     upload-profile-image.ts and multer's own `LIMIT_FILE_SIZE` sentence.
 *
 * A sentence NOT listed is shown as the server wrote it rather than re-worded,
 * the same policy as `lib/auth/auth-server-copy.ts`: re-wording a message this
 * file did not anticipate would be guessing at its meaning.
 *
 * Compared through `isServerSentence`, so a trailing full stop or a retyped
 * dash still lands on its translation.
 */
import { isServerSentence } from "@/lib/auth/auth-server-copy";
import type { SignupTranslations } from "./signup-translations";

type Label = (t: SignupTranslations) => string;

export const MEMBER_SIGNUP_SENTENCES: ReadonlyArray<readonly [string, Label]> =
	[
		[
			"That email already has an account — sign in instead.",
			(t) => t.memberSignup.errorEmailTaken,
		],
		[
			"That phone number is already used by another account",
			(t) => t.memberSignup.errorPhoneTaken,
		],
		[
			"That organisation is not available to join.",
			(t) => t.memberSignup.errorOrgUnavailable,
		],
		[
			"Could not read the organisation you chose.",
			(t) => t.memberSignup.errorOrgUnreadable,
		],
		[
			"Too many sign-up attempts. Please try again later.",
			(t) => t.memberSignup.errorTooManyAttempts,
		],
		[
			"Only JPG, PNG, and WebP images are allowed",
			(t) => t.memberSignup.errorPhotoType,
		],
		["File too large", (t) => t.memberSignup.errorPhotoTooLarge],
		["Name is required", (t) => t.memberSignup.nameRequired],
		["Invalid email", (t) => t.validation.emailInvalid],
		[
			"Password must be at least 6 characters",
			(t) => t.memberSignup.passwordMin,
		],
		["Confirm your password", (t) => t.validation.confirmPasswordRequired],
		["Passwords do not match", (t) => t.validation.passwordsMismatch],
		["Choose an organisation", (t) => t.memberSignup.chooseOrg],
		[
			"Choose Finance, Director or Ops Head — Owner is set by the organisation",
			(t) => t.memberSignup.errorOwnerLane,
		],
		["Internal Server Error", (t) => t.errors.internalServerError],
	];

/**
 * A refusal the SERVER answered with — as opposed to the request never
 * arriving (a network failure rejects `fetch` with a browser-worded
 * `TypeError`, which is not a sentence to show anyone).
 */
export class MemberSignupRefusal extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "MemberSignupRefusal";
		this.status = status;
	}
}

/** The reader's version of a register-member refusal. */
export function localiseMemberSignupRefusal(
	message: string,
	t: SignupTranslations,
): string {
	// No sentence at all (a proxy's HTML 413, an empty body) — say it failed
	// rather than print nothing under the button.
	if (!message.trim()) return t.errors.registrationFailed;
	for (const [sentence, label] of MEMBER_SIGNUP_SENTENCES) {
		if (isServerSentence(message, sentence)) return label(t);
	}
	return message;
}

/** What to print under the button for whatever the mutation threw. */
export function memberSignupErrorText(
	error: unknown,
	t: SignupTranslations,
): string {
	if (error instanceof MemberSignupRefusal) {
		return localiseMemberSignupRefusal(error.message, t);
	}
	return t.errors.unexpected;
}
