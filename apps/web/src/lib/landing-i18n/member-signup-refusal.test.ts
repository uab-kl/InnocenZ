import { describe, expect, it } from "vitest";
import {
	localiseMemberSignupRefusal,
	MemberSignupRefusal,
	memberSignupErrorText,
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
const BACKEND_SENTENCES = [
	"That email already has an account — sign in instead.",
	"That phone number is already used by another account",
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

	it("keeps the two duplicate refusals word for word in English", () => {
		expect(
			localiseMemberSignupRefusal(
				"That phone number is already used by another account",
				en,
			),
		).toBe("That phone number is already used by another account");
		expect(
			localiseMemberSignupRefusal(
				"That email already has an account — sign in instead.",
				en,
			),
		).toBe("That email already has an account — sign in instead.");
	});

	it("matches a trailing full stop and a retyped dash", () => {
		expect(
			localiseMemberSignupRefusal(
				"That phone number is already used by another account.",
				zh,
			),
		).toBe(zh.memberSignup.errorPhoneTaken);
		expect(
			localiseMemberSignupRefusal(
				"That email already has an account - sign in instead",
				zh,
			),
		).toBe(zh.memberSignup.errorEmailTaken);
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
		const error = new MemberSignupRefusal(
			"That phone number is already used by another account",
			409,
		);
		expect(memberSignupErrorText(error, zh)).toBe(
			zh.memberSignup.errorPhoneTaken,
		);
	});

	it("never prints a browser's network wording", () => {
		expect(memberSignupErrorText(new TypeError("Failed to fetch"), zh)).toBe(
			zh.errors.unexpected,
		);
	});
});
