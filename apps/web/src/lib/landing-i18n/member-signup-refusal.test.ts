import { describe, expect, it } from "vitest";
import {
	localiseMemberSignupRefusal,
	localiseSignupEmailCodeAnswer,
	localiseSignupRefusal,
	MemberSignupRefusal,
	memberSignupErrorText,
	SIGNUP_NOT_COMPLETED_SENTENCE,
	signupCodeOutcome,
} from "./member-signup-refusal";
import { signupTranslations } from "./signup-translations";

const en = signupTranslations.en;
const zh = signupTranslations.zh;

/**
 * EVERY SENTENCE `POST /auth/register-member` CAN REFUSE WITH HAS A CHINESE
 * READING.
 *
 * Copied from the BACKEND (17 Sep 2026), not from the map — a test that
 * iterated the map would pass on a map that had simply forgotten one:
 *   org-member-invite.controller.ts registerMember, outlet.schema.ts
 *   RegisterOrgMemberSchema, rate-limit.ts registerLimiter,
 *   upload-profile-image.ts fileFilter, multer LIMIT_FILE_SIZE.
 */
/**
 * What BOTH sign-ups answer about the email code (owner, 30 Sep 2026) — copied
 * from the CONTRACT handed to this client, since the backend half was being
 * built beside it and had no code to copy from yet.
 */
const EMAIL_CODE_REFUSALS = [
	"Verify your email first — we will send you a 6-digit code",
	"Invalid code",
	"Too many attempts — request a new code",
	"That code has expired — request a new one",
	"That email already has an account — sign in, or reset your password",
];

/** `POST /auth/signup-email-code` — its confirmation and its refusals. */
const EMAIL_CODE_SEND_ANSWERS = [
	"We sent a 6-digit code to that email — it expires in 10 minutes",
	"Enter a valid email address",
	"Could not send the code — try again in a few minutes",
	// rate-limit.ts otpSendLimiter / otpSendPerEmailLimiter, reused on this route.
	"Too many verification codes requested. Please try again later.",
	"Too many verification codes requested for that email. Please try again later.",
];

const BACKEND_SENTENCES = [
	// account-answers.ts SIGNUP_NOT_COMPLETED — a taken email OR phone (30 Sep 2026).
	"We couldn't complete sign-up — if you already have an account, sign in or reset your password",
	...EMAIL_CODE_REFUSALS,
	"That organisation is not available to join.",
	"Could not read the organisation you chose.",
	"Too many sign-up attempts. Please try again later.",
	"Only JPG, PNG, and WebP images are allowed",
	"File too large",
	"Name is required",
	"Invalid email",
	"Password must be at least 6 characters",
	"Confirm your password",
	"Passwords do not match",
	"Choose an organisation",
	"Choose Finance, Director or Ops Head — Owner is set by the organisation",
	"Internal Server Error",
];

const HAN = /[一-鿿]/;

describe("localiseMemberSignupRefusal", () => {
	it.each(BACKEND_SENTENCES)("reads %s in Chinese on a 中文 session", (s) => {
		const out = localiseMemberSignupRefusal(s, zh);
		expect(out).not.toBe(s);
		expect(out).toMatch(HAN);
	});

	it.each(BACKEND_SENTENCES)("reads %s in English on an EN session", (s) => {
		const out = localiseMemberSignupRefusal(s, en);
		expect(out.trim()).not.toBe("");
		expect(out).not.toMatch(HAN);
	});

	it("keeps the collision refusal word for word in English, naming no field", () => {
		const out = localiseMemberSignupRefusal(SIGNUP_NOT_COMPLETED_SENTENCE, en);
		expect(out.replace(/\.$/, "")).toBe(SIGNUP_NOT_COMPLETED_SENTENCE);
		expect(out).not.toMatch(/\b(email|phone)\b/i);
	});

	it("matches a trailing full stop and a retyped dash", () => {
		expect(
			localiseMemberSignupRefusal(`${SIGNUP_NOT_COMPLETED_SENTENCE}.`, zh),
		).toBe(zh.errors.signupNotCompleted);
		expect(
			localiseMemberSignupRefusal(
				SIGNUP_NOT_COMPLETED_SENTENCE.replace(" — ", " - "),
				zh,
			),
		).toBe(zh.errors.signupNotCompleted);
	});

	it("shows an unknown sentence as the server wrote it", () => {
		expect(localiseMemberSignupRefusal("Something new", zh)).toBe(
			"Something new",
		);
	});

	it("says it failed when there is no sentence at all", () => {
		expect(localiseMemberSignupRefusal("", zh)).toBe(
			zh.errors.registrationFailed,
		);
	});

	it("says the minimum this form enforces, not the organisation form's", () => {
		expect(en.memberSignup.passwordMin).toContain("6");
		expect(zh.memberSignup.passwordMin).toContain("6");
	});
});

describe("memberSignupErrorText", () => {
	it("localises a server refusal", () => {
		const error = new MemberSignupRefusal(SIGNUP_NOT_COMPLETED_SENTENCE, 409);
		expect(memberSignupErrorText(error, zh)).toBe(zh.errors.signupNotCompleted);
	});

	it("never prints a browser's network wording", () => {
		expect(memberSignupErrorText(new TypeError("Failed to fetch"), zh)).toBe(
			zh.errors.unexpected,
		);
	});
});

/**
 * The ORGANISATION sign-up (`POST /auth/register`) answers the same code
 * refusals and the same collision sentence; its form reads them through
 * `localiseSignupRefusal`.
 */
describe("localiseSignupRefusal (the organisation form)", () => {
	const ORG_SENTENCES = [
		SIGNUP_NOT_COMPLETED_SENTENCE,
		...EMAIL_CODE_REFUSALS,
		"Too many sign-up attempts. Please try again later.",
	];

	it.each(ORG_SENTENCES)("reads %s in Chinese on a 中文 session", (s) => {
		const out = localiseSignupRefusal(s, zh);
		expect(out).not.toBe(s);
		expect(out).toMatch(HAN);
	});

	it.each(ORG_SENTENCES)("reads %s in English on an EN session", (s) => {
		expect(localiseSignupRefusal(s, en)).not.toMatch(HAN);
	});

	it("shows an unknown sentence as sent, and nothing as a failure", () => {
		expect(localiseSignupRefusal("Something new", zh)).toBe("Something new");
		expect(localiseSignupRefusal(undefined, zh)).toBe(
			zh.errors.registrationFailed,
		);
		expect(localiseSignupRefusal("  ", en)).toBe(en.errors.registrationFailed);
	});
});

describe("localiseSignupEmailCodeAnswer (the box that sends the code)", () => {
	it.each([...EMAIL_CODE_SEND_ANSWERS, ...EMAIL_CODE_REFUSALS])(
		"reads %s in Chinese on a 中文 session",
		(s) => {
			const out = localiseSignupEmailCodeAnswer(s, zh);
			expect(out).not.toBe(s);
			expect(out).toMatch(HAN);
		},
	);

	it.each([...EMAIL_CODE_SEND_ANSWERS, ...EMAIL_CODE_REFUSALS])(
		"keeps %s word for word in English",
		(s) => {
			expect(localiseSignupEmailCodeAnswer(s, en)).toBe(s);
		},
	);

	it("keeps the server's own seconds in the resend wait", () => {
		const wait = "Wait 42s before requesting another code";
		expect(localiseSignupEmailCodeAnswer(wait, en)).toBe(wait);
		expect(localiseSignupEmailCodeAnswer(wait, zh)).toBe(
			"请等待 42 秒后再获取验证码",
		);
		expect(localiseSignupEmailCodeAnswer(`${wait}.`, zh)).toContain("42");
	});

	it("a send with no sentence at all says the send failed", () => {
		expect(localiseSignupEmailCodeAnswer("", zh)).toBe(zh.emailCode.sendFailed);
		expect(localiseSignupEmailCodeAnswer("", en)).toBe(en.emailCode.sendFailed);
	});

	it("shows an unknown sentence as sent", () => {
		expect(localiseSignupEmailCodeAnswer("Something new", zh)).toBe(
			"Something new",
		);
	});
});

/**
 * WHAT A REFUSED SIGN-UP DOES TO THE CODE. A spent or missing code sends the
 * box back to "send code"; a wrong one may be typed again (the server allows
 * five guesses per code — that is what its "Too many attempts" counts).
 */
describe("signupCodeOutcome", () => {
	it.each([
		[409, SIGNUP_NOT_COMPLETED_SENTENCE],
		[
			409,
			"That email already has an account — sign in, or reset your password",
		],
		[409, "A 409 nobody named yet"],
		[400, "That code has expired — request a new one"],
		[400, "Verify your email first — we will send you a 6-digit code"],
		[429, "Too many attempts — request a new code"],
		// A retyped dash or a full stop is still the sentence.
		[400, "That code has expired - request a new one."],
	])("%i %s → resend", (status, message) => {
		expect(signupCodeOutcome(message, status)).toBe("resend");
	});

	it("a wrong code → retype", () => {
		expect(signupCodeOutcome("Invalid code", 400)).toBe("retype");
		expect(signupCodeOutcome("Invalid code.", null)).toBe("retype");
	});

	it.each([
		[429, "Too many sign-up attempts. Please try again later."],
		[400, "Passwords do not match"],
		[400, "Invalid email"],
		[500, "Internal Server Error"],
		[null, ""],
		[undefined, undefined],
	])("%s %s leaves the code alone", (status, message) => {
		expect(signupCodeOutcome(message, status)).toBe("keep");
	});
});
