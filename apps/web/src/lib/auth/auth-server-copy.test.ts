import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import type { CodeDelivery } from "./auth-flow-client";
import {
	AUTH_SERVER_SENTENCES,
	describeCodeDelivery,
	isForgotCodeRefusal,
	localiseAuthMessage,
} from "./auth-server-copy";

/**
 * EVERY SENTENCE THE SERVER CAN SAY IN THE CODE FLOWS HAS AN ENGLISH AND A
 * CHINESE READING.
 *
 * The list below is copied from the shared contract, NOT from the map in
 * `auth-server-copy.ts` — a test that iterated the map would pass on a map that
 * had simply forgotten a sentence. Iterating the contract is what catches the
 * omission.
 */
const CONTRACT_SENTENCES = [
	"Could not send the code — try again later",
	"Invalid code",
	"If that account exists, we sent a code by WhatsApp, SMS and email.",
	"This code has expired — request a new one",
	"Password updated — sign in with your new password",
	"Use Forgot password on the sign-in page",
	"That is already your email",
	"That is already your phone number",
	"That email is already used by another account",
	"That phone number is already used by another account",
	"Your account has no phone or email we can send a code to",
	"Code sent",
	"This change has expired — start again",
	"This code was already used",
	"Email updated",
	"Phone number updated",
	"Changing your phone now needs a code to your current contacts — please update the app",
	"New password must be different",
	"Current password is incorrect",
	"Password updated",
	"Change your email from Security settings",
	"Change your phone from Security settings",
	"Only the PR can change their sign-in email or phone",
];

/**
 * Not named in the contract but sent on the same routes by the backend as
 * built (read from apps/backend/src/features/account-code on 17 Sep 2026): the
 * attempt cap and the rate limiters mounted on those routes.
 */
const BACKEND_OBSERVED_SENTENCES = [
	"Too many attempts — request a new code",
	"Too many password reset requests. Please try again later.",
	"Too many attempts. Please wait a few minutes and try again.",
	"Too many verification codes requested. Please try again later.",
	"Too many attempts. Please try again later.",
	"Too many password change attempts. Please try again later.",
	// contact-change.controller.ts 500s, password-change.controller.ts 400,
	// and the `ApiError.INTERNAL_SERVER_ERROR` catch-all of every handler.
	"Could not start the change",
	"Could not send the code",
	"This account cannot change password here",
	"Internal Server Error",
	// account-code/schemas.ts — the first zod issue is what a 400 carries.
	"Validation failed",
	"Enter your email or your phone number",
	"Enter a valid email address",
	"Enter a valid phone number",
	"Enter the 6-digit code",
	"Enter the new email or phone number",
	"Current password is required",
];

/** Sentences with a number in them — matched by pattern, not by the map. */
const PATTERNED_SENTENCES = [
	"Wait 42s before requesting another code",
	"Password must be at least 6 characters long",
	"Password must be at most 72 characters long",
];

const ALL_SENTENCES = [...CONTRACT_SENTENCES, ...BACKEND_OBSERVED_SENTENCES];

const HAS_CJK = /[㐀-鿿]/;

describe("localiseAuthMessage", () => {
	it.each(ALL_SENTENCES)("maps %s in EN and zh", (sentence) => {
		// EN reads back word-for-word: the dictionary value IS the server wording.
		expect(localiseAuthMessage(sentence, translations.en)).toBe(sentence);
		const zh = localiseAuthMessage(sentence, translations.zh);
		expect(zh).not.toBe(sentence);
		expect(zh.trim()).not.toBe("");
		expect(zh).toMatch(HAS_CJK);
	});

	it("the map holds exactly these sentences — nothing stale, nothing missing", () => {
		const canonicalContract = ALL_SENTENCES.map((s) =>
			s.replace(/\.$/, ""),
		).sort();
		expect(Object.keys(AUTH_SERVER_SENTENCES).sort()).toEqual(
			canonicalContract,
		);
	});

	it.each(PATTERNED_SENTENCES)("reads the number out of %s", (sentence) => {
		expect(localiseAuthMessage(sentence, translations.en)).toBe(sentence);
		const zh = localiseAuthMessage(sentence, translations.zh);
		const n = /\d+/.exec(sentence)?.[0] ?? "";
		expect(zh).toContain(n);
		expect(zh).toMatch(HAS_CJK);
	});

	it("tolerates a trailing full stop and a spaced hyphen for the em dash", () => {
		expect(localiseAuthMessage("Invalid code.", translations.zh)).toBe(
			translations.zh.authCodes.serverInvalidCode,
		);
		expect(
			localiseAuthMessage(
				"This code has expired - request a new one",
				translations.zh,
			),
		).toBe(translations.zh.authCodes.serverCodeExpired);
	});

	it("forgot/complete: a wrong, an expired and a used-up code are ONE refusal", () => {
		// An address with no account gets a random requestId that "has expired";
		// a real account's wrong code is "Invalid code". The page must not show
		// them apart, or it tells a stranger which addresses have accounts.
		for (const sentence of [
			"Invalid code",
			"Invalid code.",
			"This code has expired — request a new one",
			"This code has expired - request a new one",
			"Too many attempts — request a new code",
		]) {
			expect(isForgotCodeRefusal(sentence), sentence).toBe(true);
		}
		// Everything else keeps its own sentence — a cooldown, a limiter, a
		// password the schema refused.
		for (const sentence of [
			"Wait 42s before requesting another code",
			"Too many attempts. Please wait a few minutes and try again.",
			"Password must be at least 6 characters long",
			"This code was already used",
			"",
		]) {
			expect(isForgotCodeRefusal(sentence), sentence).toBe(false);
		}
		expect(translations.zh.authCodes.forgotCodeRejected).toMatch(HAS_CJK);
	});

	it("shows a sentence it does not know exactly as the server wrote it", () => {
		const unknown = "Too many requests, please try again later.";
		expect(localiseAuthMessage(unknown, translations.en)).toBe(unknown);
		expect(localiseAuthMessage(unknown, translations.zh)).toBe(unknown);
	});

	it("every authCodes string is non-empty in both languages", () => {
		for (const locale of ["en", "zh"] as const) {
			for (const [key, value] of Object.entries(
				translations[locale].authCodes,
			)) {
				expect(value.trim(), `${locale}.authCodes.${key}`).not.toBe("");
			}
		}
	});
});

describe("describeCodeDelivery", () => {
	const phone = "+60 ••••• 6789";
	const mail = "o••••@atlas-agency.my";

	it("groups channels by destination — the contract's own example", () => {
		const sentTo: CodeDelivery[] = [
			{ channel: "email", to: mail, status: "sent" },
			{ channel: "sms", to: phone, status: "sent" },
			{ channel: "whatsapp", to: phone, status: "sent" },
		];
		const en = describeCodeDelivery(sentTo, translations.en);
		expect(en.sent).toBe(
			`Code sent by WhatsApp and SMS to ${phone} and by email to ${mail}.`,
		);
		expect(en.failed).toBeNull();
		expect(en.logged).toBeNull();
		expect(en.none).toBeNull();

		const zh = describeCodeDelivery(sentTo, translations.zh);
		expect(zh.sent).toContain(phone);
		expect(zh.sent).toContain(mail);
		expect(zh.sent).toMatch(HAS_CJK);
	});

	it("never names a skipped channel, and says which one failed", () => {
		const en = describeCodeDelivery(
			[
				{ channel: "whatsapp", to: phone, status: "sent" },
				{ channel: "sms", to: phone, status: "skipped" },
				{ channel: "email", to: mail, status: "failed" },
			],
			translations.en,
		);
		expect(en.sent).toBe(`Code sent by WhatsApp to ${phone}.`);
		expect(en.failed).toBe("Could not send by email.");
	});

	it("flags a dev-mode log, and says so when nothing went out at all", () => {
		const logged = describeCodeDelivery(
			[{ channel: "email", to: mail, status: "logged" }],
			translations.en,
		);
		expect(logged.sent).toBe(`Code sent by email to ${mail}.`);
		expect(logged.logged).toBe(translations.en.authCodes.deliveryLogged);

		const none = describeCodeDelivery(
			[{ channel: "sms", to: phone, status: "skipped" }],
			translations.zh,
		);
		expect(none.sent).toBeNull();
		expect(none.none).toBe(translations.zh.authCodes.deliveryNone);
	});
});
