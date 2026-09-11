/**
 * CHANGING YOUR OWN MOBILE NUMBER — the web half of a flow that already worked.
 *
 * Owner, 11 Sep 2026: "fix this 2 please" — the first being that changing a
 * phone number on the web reached nothing.
 *
 * ⚠️ WHAT WAS THERE BEFORE. The Security settings sheet asked for an OTP with
 * no request at all, showed "OTP sent to +60…" as a label rather than a
 * receipt, and accepted `verifyDemoOtp` — `code === "123456" ||
 * code.length === 6`, so any six characters passed, `"abcdef"` included. It
 * then called a handler guarded by `if (!profile.backed)`, which is FALSE on a
 * real login: the number changed nowhere, not even on screen.
 *
 * None of the backend was missing. `POST /auth/otp/send`, `/auth/otp/verify`
 * and `/auth/phone/change` exist, are rate-limited, and are what the PR mobile
 * app has always used. Only the web never called them. So this file is wiring,
 * not new machinery — and deliberately the SAME three calls in the same order
 * as `apps/mobile/src/lib/api.ts`, because a second way to change a phone
 * number is a second way to get it wrong.
 *
 * The proof chain, which is why this is three calls and not one:
 *   1. `send`   — the server puts a real code on WhatsApp and stores its hash.
 *   2. `verify` — the code is checked (5 attempts, then the row expires) and a
 *      `verificationId` is minted. That id IS the proof.
 *   3. `change` — spends the id. The server takes WHOSE number to change from
 *      the bearer token, never from the body, so this cannot rewrite anyone
 *      else's, and it refuses a number already on another account with a 409.
 *
 * `purpose: "change_phone"` is required, and is why `send` must carry the
 * token: the other two purposes (signup, forgot_password) are public, this one
 * is not.
 */
import axios from "axios";
import { apiErrorCopy } from "@/lib/auth/api-error-copy";
import { saveAccessToken, saveRefreshToken } from "@/lib/auth/auth-storage";
import { kickToLogin } from "@/lib/auth/guards";
import { getClient } from "@/lib/axios-v1";

interface ApiResponse<T> {
	success: boolean;
	message: string;
	data: T;
}

/** Server message when there is one — these are written to be shown as-is. */
function serverMessage(error: unknown, fallback: string): Error {
	if (axios.isAxiosError(error)) {
		const message = (error.response?.data as { message?: string } | undefined)
			?.message;
		if (message) return new Error(message);
	}
	if (error instanceof Error && error.message) return error;
	return new Error(fallback);
}

/**
 * THE NUMBER WHATSAPP CAN ACTUALLY REACH.
 *
 * Owner, 11 Sep 2026: "need the format then only can receive otp? if got format
 * need set for user to input."
 *
 * ⚠️ YES, AND THIS IS WHY NO CODE ARRIVED. The server's only cleaning is
 * `normalizePhoneDigits` — `value.replace(/\D/g, '')` — which strips spaces and
 * dashes and NOTHING else. It does not add a country code and does not remove
 * a leading zero. So the Malaysian way of writing a number, `0123456789`, went
 * to WhatsApp exactly like that, and WhatsApp cannot deliver to it: the code
 * was genuinely sent, to a number that does not exist in E.164. The page then
 * said "OTP sent to 0123456789" and waited for a code nobody could receive.
 *
 * The PR app never hit this because it has a country-code picker and composes
 * the number with `phoneLoginIdentifier` (apps/mobile/src/lib/phone-prefs.ts).
 * The web has one free-text box, so it has to do the same work here. Same rule,
 * deliberately: two different ideas of "the number" is how an account ends up
 * unreachable on one surface and fine on the other.
 *
 *   "0123456789"       → 60123456789
 *   "+60 12-345 6789"  → 60123456789
 *   "60123456789"      → 60123456789
 *
 * A leading `60` is treated as already carrying the country code; a Malaysian
 * mobile is `01x…` locally, so after the zero comes off it can never begin
 * `60` by accident.
 */
export function toWhatsAppNumber(raw: string, dialCode = "60"): string {
	const typed = (raw ?? "").trim();
	const digits = typed.replace(/\D/g, "");
	if (!digits) return "";

	/*
	 * OUR OWN DIAL CODE FIRST, before the `+` shortcut below.
	 *
	 * "+60 0123456789" is the dial code followed by the LOCAL form — zero and
	 * all — and it is a very natural thing to type. Returning it untouched gave
	 * `600123456789`: one digit too long, undeliverable, and long enough to pass
	 * the server's length check, so the failure was silent. The stray zero has
	 * to come off whether or not a `+` was typed.
	 */
	if (digits.startsWith(dialCode)) {
		return dialCode + digits.slice(dialCode.length).replace(/^0+/, "");
	}

	/*
	 * A leading `+` on anything else means "this is already a full number" —
	 * honour it. Without this, "+65 8123 4567" became `606581234567`: our dial
	 * code prepended to a number that already had one, with no way to enter a
	 * foreign handset at all.
	 */
	if (typed.startsWith("+")) return digits;

	// Plain local form — "0123456789" — where the zero stands in for the code.
	return dialCode + digits.replace(/^0+/, "");
}

/**
 * IS THIS A NUMBER WHATSAPP COULD REACH? Returns a reason, or null when fine.
 *
 * Owner, 11 Sep 2026: "where you let user know, where is the validation? input
 * error message."
 *
 * ⚠️ There was NO client-side check at all. `toWhatsAppNumber("123")` happily
 * produces `60123`, the request goes out, and the person waits for a code that
 * was addressed to nothing — the same silent failure the leading zero caused,
 * reached by a different route. Catching it here means the mistake is named
 * beside the field instead of becoming a message that never arrives.
 *
 * The rule is deliberately LOOSE — length only, no prefix table. A Malaysian
 * mobile is `01X` plus 7 or 8 more digits, so `60` + 9 or 10 = 11 or 12. Every
 * mobile prefix (`010`–`019`) passes without this file having to know which
 * ones exist, and a landline or a typo does not. Guessing at valid prefixes
 * would reject real numbers the day a new one is issued, which is worse than
 * letting the server have the last word — and the server still does.
 */
export function phoneNumberProblem(
	raw: string,
	copy: { empty: string; tooShort: string; tooLong: string },
): string | null {
	const full = toWhatsAppNumber(raw);
	if (!full) return copy.empty;
	if (full.length < 11) return copy.tooShort;
	if (full.length > 12) return copy.tooLong;
	return null;
}

export type OtpSendResult = {
	/** Seconds until the code stops working. */
	expiresInSec: number;
	/** Seconds before "Resend" should be offered again. */
	resendAfterSec: number;
};

/**
 * Put a real code on the NEW number over WhatsApp.
 *
 * Sent to the number being claimed, not the one on file — proving the person
 * holds the handset they are moving to is the entire point. Rate-limited per
 * caller AND per phone number on the server, so a failure here can legitimately
 * be "too many requests"; those messages are written to be shown as-is.
 */
export async function sendPhoneChangeOtp(
	phoneNum: string,
): Promise<OtpSendResult> {
	const failed = apiErrorCopy().profile.otpSendFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<ApiResponse<OtpSendResult>>(
			"/auth/otp/send",
			{
				phoneNum: toWhatsAppNumber(phoneNum),
				channel: "whatsapp",
				purpose: "change_phone",
			},
		);
		if (!response.data.success) {
			throw new Error(response.data.message || failed);
		}
		return response.data.data ?? { expiresInSec: 300, resendAfterSec: 60 };
	} catch (error) {
		throw serverMessage(error, failed);
	}
}

/**
 * Check the code and collect the receipt.
 *
 * The returned `verificationId` is the ONLY proof `changeMyPhone` accepts, and
 * it is single-use — the server marks it consumed. Five wrong guesses expire
 * the row and the person must request a new code.
 */
export async function verifyPhoneChangeOtp(
	phoneNum: string,
	code: string,
): Promise<string> {
	const failed = apiErrorCopy().profile.invalidOtp;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<ApiResponse<{ verificationId: string }>>(
			"/auth/otp/verify",
			{
				phoneNum: toWhatsAppNumber(phoneNum),
				code: code.trim(),
				purpose: "change_phone",
			},
		);
		const verificationId = response.data.data?.verificationId;
		if (!response.data.success || !verificationId) {
			throw new Error(response.data.message || failed);
		}
		return verificationId;
	} catch (error) {
		throw serverMessage(error, failed);
	}
}

/**
 * Spend the receipt and write the number.
 *
 * Takes no user id: the server reads the account off the verified token, so
 * this is self-only by construction rather than by a check a caller could
 * forget. A number already in use answers 409 with a sentence worth showing.
 */
export async function changeMyPhone(
	phoneNum: string,
	verificationId: string,
): Promise<void> {
	const failed = apiErrorCopy().profile.mobileUpdateFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiResponse<{ accessToken?: string; refreshToken?: string } | null>
		>("/auth/phone/change", {
			phoneNum: toWhatsAppNumber(phoneNum),
			verificationId,
		});
		if (!response.data.success) {
			throw new Error(response.data.message || failed);
		}
		/*
		 * ⚠️ STORE THE NEW TOKENS, OR THIS SIGNS THE PERSON OUT.
		 *
		 * A JWT here carries only `{loginMethod, loginCriteria}` — no user id —
		 * and every request resolves the account by looking that criteria up. So
		 * the moment the number changes, a PHONE-keyed token points at a number
		 * nobody holds and the very next call answers 401 `Unauthorized`. That is
		 * the exact bug the PR app hit; the server now re-issues a pair bound to
		 * the new number, and it only helps if the client actually keeps them.
		 *
		 * Absent for an EMAIL-keyed session, which the server deliberately leaves
		 * alone because its token still resolves — hence the optional read rather
		 * than a required one.
		 */
		const issued = response.data.data;
		if (issued?.accessToken) saveAccessToken(issued.accessToken);
		if (issued?.refreshToken) saveRefreshToken(issued.refreshToken);
	} catch (error) {
		throw serverMessage(error, failed);
	}
}
