/**
 * WHAT A PERSON TYPED INTO "EMAIL OR PHONE NUMBER" ON /forgot-password.
 *
 * Owner, 17 Sep 2026: forgot password takes the email OR the phone the person
 * remembers — `POST /auth/password/forgot/start` accepts `{ email }` or
 * `{ phoneNum }`, and the PR app already offers both. The web page asked for an
 * email only, so somebody who had forgotten which address was on the account
 * but knew their number had no way in.
 *
 * ONE field, decided by its shape: an `@` is an email, a string of digits (with
 * the spaces, dashes, brackets and `+` people type) is a phone. Letters without
 * an `@` are neither, and are refused here rather than being sent as a phone
 * number that normalises to nothing.
 *
 * The phone is normalised by `toWhatsAppNumber` — the web's one normaliser, the
 * same rule `normaliseContactValue` uses for a contact change — so "0123456789"
 * and "+60 12-345 6789" are the same request, and the server's per-identifier
 * cooldown counts them as one.
 *
 * ⚠️ Leaf module: no React, no dictionary. The page turns a `problem` into words.
 */
import { phoneNumberProblem, toWhatsAppNumber } from "@/lib/auth/phone-api";

export type ForgotIdentifier =
	| { kind: "email"; value: string }
	| { kind: "phone"; value: string };

export type ForgotIdentifierProblem =
	/** Nothing typed. */
	| "empty"
	/** Has an `@` but is not an address. */
	| "invalidEmail"
	/** Letters and no `@` — neither an email nor a phone number. */
	| "invalidIdentifier"
	| "phoneTooShort"
	| "phoneTooLong";

export type ForgotIdentifierReading =
	| { ok: true; identifier: ForgotIdentifier }
	| { ok: false; problem: ForgotIdentifierProblem };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Anything a phone number can legitimately be typed with. */
const PHONE_SHAPE_RE = /^[\d\s()+.-]+$/;

export function readForgotIdentifier(raw: string): ForgotIdentifierReading {
	const typed = (raw ?? "").trim();
	if (!typed) return { ok: false, problem: "empty" };

	if (typed.includes("@")) {
		const email = typed.toLowerCase();
		return EMAIL_RE.test(email)
			? { ok: true, identifier: { kind: "email", value: email } }
			: { ok: false, problem: "invalidEmail" };
	}

	if (!PHONE_SHAPE_RE.test(typed)) {
		return { ok: false, problem: "invalidIdentifier" };
	}

	const problem = phoneNumberProblem(typed, {
		empty: "empty",
		tooShort: "phoneTooShort",
		tooLong: "phoneTooLong",
	});
	if (problem) {
		return {
			ok: false,
			problem:
				problem === "empty"
					? "invalidIdentifier"
					: (problem as ForgotIdentifierProblem),
		};
	}
	return {
		ok: true,
		identifier: { kind: "phone", value: `+${toWhatsAppNumber(typed)}` },
	};
}

/** The request body `forgot/start` takes — exactly one of the two keys. */
export function forgotStartBody(
	identifier: ForgotIdentifier,
): { email: string } | { phoneNum: string } {
	return identifier.kind === "email"
		? { email: identifier.value.trim().toLowerCase() }
		: { phoneNum: identifier.value };
}
