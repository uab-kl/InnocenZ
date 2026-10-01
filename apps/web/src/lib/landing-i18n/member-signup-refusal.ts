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
 *   - org-member-invite.controller.ts `registerMember`: the one 409 for a
 *     taken email OR phone (`SIGNUP_NOT_COMPLETED`, account-answers.ts — since
 *     30 Sep 2026 it names neither), the 404 for an organisation that cannot
 *     be joined, the 400 for an unreadable `join`, and the
 *     `Error.INTERNAL_SERVER_ERROR` catch-all;
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
 *
 * ⚠️ It also carries what BOTH sign-ups share (owner, 30 Sep 2026): the email
 * code that must prove an address before `POST /auth/register` or
 * `POST /auth/register-member` creates anything, the answers of
 * `POST /auth/signup-email-code` that sends it, and `signupCodeOutcome` — what
 * a refused sign-up means for that code. Those sentences come from the
 * contract of the backend being built beside this client on 30 Sep 2026, not
 * from its code, which did not exist yet.
 */
import { isServerSentence } from "@/lib/auth/auth-server-copy";
import type { SignupTranslations } from "./signup-translations";

type Label = (t: SignupTranslations) => string;

/**
 * The ONE answer both sign-ups give a taken email, phone or ID number (owner,
 * 29 Sep 2026: "General message, both") — `SIGNUP_NOT_COMPLETED` in
 * apps/backend/src/features/auth/account-answers.ts, word for word. Exported
 * for the organisation sign-up form, which receives the same sentence from
 * `POST /auth/register`.
 */
export const SIGNUP_NOT_COMPLETED_SENTENCE =
	"We couldn't complete sign-up — if you already have an account, sign in or reset your password";

/** `POST /auth/signup-email-code` 200 — the same for EVERY well-formed address. */
export const SIGNUP_EMAIL_CODE_SENT_SENTENCE =
	"We sent a 6-digit code to that email — it expires in 10 minutes";
/** Both sign-ups, 400 — `emailCodeId` or `emailCode` missing. */
export const SIGNUP_VERIFY_EMAIL_FIRST_SENTENCE =
	"Verify your email first — we will send you a 6-digit code";
/** Both sign-ups, 400 — a wrong code; the code itself is still good. */
export const SIGNUP_INVALID_CODE_SENTENCE = "Invalid code";
/** Both sign-ups, 429 — the fifth wrong code killed it. */
export const SIGNUP_CODE_ATTEMPTS_SENTENCE =
	"Too many attempts — request a new code";
/** Both sign-ups, 400 — the code is unknown, expired or already used. */
export const SIGNUP_CODE_EXPIRED_SENTENCE =
	"That code has expired — request a new one";
/**
 * Both sign-ups, 409 — said ONLY because the code has just proved the address
 * belongs to the person asking. A taken phone or ID number is still
 * `SIGNUP_NOT_COMPLETED_SENTENCE`, which names nothing.
 */
export const SIGNUP_EMAIL_HAS_ACCOUNT_SENTENCE =
	"That email already has an account — sign in, or reset your password";

/**
 * Every sentence about the email code — its send route's answers and the
 * sign-ups' refusals of it. `Wait 42s before requesting another code` carries
 * a number and is read by `WAIT_RE` instead.
 */
const SIGNUP_EMAIL_CODE_SENTENCES: ReadonlyArray<readonly [string, Label]> = [
	[SIGNUP_EMAIL_CODE_SENT_SENTENCE, (t) => t.emailCode.serverSent],
	["Enter a valid email address", (t) => t.emailCode.serverEnterValidEmail],
	[
		"Could not send the code — try again in a few minutes",
		(t) => t.emailCode.serverCouldNotSend,
	],
	// rate-limit.ts — the IP and per-address budgets the phone code already uses.
	[
		"Too many verification codes requested. Please try again later.",
		(t) => t.emailCode.serverTooManyCodes,
	],
	[
		"Too many verification codes requested for that email. Please try again later.",
		(t) => t.emailCode.serverTooManyCodesForEmail,
	],
	[SIGNUP_VERIFY_EMAIL_FIRST_SENTENCE, (t) => t.emailCode.serverVerifyFirst],
	[SIGNUP_INVALID_CODE_SENTENCE, (t) => t.emailCode.serverInvalidCode],
	[SIGNUP_CODE_ATTEMPTS_SENTENCE, (t) => t.emailCode.serverTooManyAttempts],
	[SIGNUP_CODE_EXPIRED_SENTENCE, (t) => t.emailCode.serverCodeExpired],
	[SIGNUP_EMAIL_HAS_ACCOUNT_SENTENCE, (t) => t.emailCode.serverEmailHasAccount],
];

/**
 * What `POST /auth/register` and `POST /auth/register-member` BOTH answer —
 * the organisation form reads exactly this list; the member form reads it
 * plus its own sentences below.
 */
export const SIGNUP_SHARED_SENTENCES: ReadonlyArray<readonly [string, Label]> =
	[
		[SIGNUP_NOT_COMPLETED_SENTENCE, (t) => t.errors.signupNotCompleted],
		...SIGNUP_EMAIL_CODE_SENTENCES,
		// rate-limit.ts `registerLimiter`, mounted on both routes.
		[
			"Too many sign-up attempts. Please try again later.",
			(t) => t.memberSignup.errorTooManyAttempts,
		],
	];

export const MEMBER_SIGNUP_SENTENCES: ReadonlyArray<readonly [string, Label]> =
	[
		...SIGNUP_SHARED_SENTENCES,
		[
			"That organisation is not available to join.",
			(t) => t.memberSignup.errorOrgUnavailable,
		],
		[
			"Could not read the organisation you chose.",
			(t) => t.memberSignup.errorOrgUnreadable,
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

/** "Wait 42s before requesting another code" — the one sentence with a number. */
const WAIT_RE = /^Wait (\d+)\s?s before requesting another code$/;

/** The translation of `message` from `list`, or null when it is not there. */
function translate(
	message: string,
	list: ReadonlyArray<readonly [string, Label]>,
	t: SignupTranslations,
): string | null {
	for (const [sentence, label] of list) {
		if (isServerSentence(message, sentence)) return label(t);
	}
	const wait = WAIT_RE.exec(message.trim().replace(/\.$/, ""));
	return wait ? t.emailCode.serverWait.replace("{s}", wait[1]) : null;
}

/** The reader's version of a register-member refusal. */
export function localiseMemberSignupRefusal(
	message: string,
	t: SignupTranslations,
): string {
	// No sentence at all (a proxy's HTML 413, an empty body) — say it failed
	// rather than print nothing under the button.
	if (!message.trim()) return t.errors.registrationFailed;
	return translate(message, MEMBER_SIGNUP_SENTENCES, t) ?? message;
}

/** The organisation form's reading of a refused `POST /auth/register`. */
export function localiseSignupRefusal(
	message: string | undefined,
	t: SignupTranslations,
): string {
	if (!message?.trim()) return t.errors.registrationFailed;
	return translate(message, SIGNUP_SHARED_SENTENCES, t) ?? message;
}

/**
 * An answer about the email code, for the box that sends it — the send's own
 * confirmation or refusal. No sentence at all (the request never arrived) says
 * the send failed rather than print nothing.
 */
export function localiseSignupEmailCodeAnswer(
	message: string,
	t: SignupTranslations,
): string {
	if (!message.trim()) return t.emailCode.sendFailed;
	return translate(message, SIGNUP_SHARED_SENTENCES, t) ?? message;
}

/**
 * WHAT A REFUSED SIGN-UP MEANS FOR THE EMAIL CODE THE PAGE IS HOLDING.
 *
 *  - `resend` — the code is spent or was never taken: ANY 409 (the code was
 *    accepted, and an accepted code is used up by whatever the answer is), the
 *    fifth wrong guess, an unknown/expired/used code, or the fields missing.
 *    The box goes back to "send code"; everything else typed stays.
 *  - `retype` — "Invalid code". Deliberately NOT a reset: the server allows
 *    five guesses per code (that is what its own "Too many attempts" counts),
 *    and every resend spends the address's hourly send budget — resetting on
 *    one typo would lock a person out after three.
 *  - `keep` — anything else (a limiter, a field the form got wrong, a 5xx):
 *    the code was not spent, so the digits typed are still good.
 */
export type SignupCodeOutcome = "resend" | "retype" | "keep";

const CODE_SPENT_SENTENCES = [
	SIGNUP_VERIFY_EMAIL_FIRST_SENTENCE,
	SIGNUP_CODE_ATTEMPTS_SENTENCE,
	SIGNUP_CODE_EXPIRED_SENTENCE,
	SIGNUP_EMAIL_HAS_ACCOUNT_SENTENCE,
];

export function signupCodeOutcome(
	message: string | undefined,
	status: number | null | undefined,
): SignupCodeOutcome {
	if (status === 409) return "resend";
	const text = message ?? "";
	if (isServerSentence(text, SIGNUP_INVALID_CODE_SENTENCE)) return "retype";
	return CODE_SPENT_SENTENCES.some((sentence) =>
		isServerSentence(text, sentence),
	)
		? "resend"
		: "keep";
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
