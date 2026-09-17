/**
 * THE PHONE NUMBER AS WHATSAPP AND SMS CAN REACH IT — the web's one normaliser.
 *
 * This file used to also hold the web phone-change calls (`/auth/otp/send` with
 * `purpose: "change_phone"`, `/auth/otp/verify`, `/auth/phone/change`). Those
 * proved only that the person held the NEW handset, so an unlocked session was
 * enough to move an account onto somebody else's phone. The server now refuses
 * that route, and changing a phone or an email is the two-code flow in
 * `contact-change-api.ts` (owner, 17 Sep 2026).
 *
 * What stays is the part every lane still needs: turning what a person TYPES
 * into the number a code can actually be delivered to.
 */

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
	let digits = typed.replace(/\D/g, "");
	/*
	 * `00` IS THE INTERNATIONAL PREFIX, the same thing a `+` says — the server's
	 * normaliser (`toWhatsAppDigits`) strips it before anything else. Without
	 * this, "0060123456789" lost only its zeros to the local rule below and
	 * became `6060123456789`: a number the web showed and sent, and one the
	 * server would never have produced from the same typing.
	 */
	let international = typed.startsWith("+");
	if (digits.startsWith("00")) {
		digits = digits.slice(2);
		international = true;
	}
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
	 *
	 * A `+` or `00` followed by a ZERO is not a country code, though ("+0123…"):
	 * that falls through to the local rule, exactly as the server reads it.
	 */
	if (international && !digits.startsWith("0")) return digits;

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
 *
 * ⚠️ The 11-12 rule is MALAYSIAN, and is applied only to a number that resolves
 * to `60`. It used to be applied to every number, so a real foreign handset —
 * "+65 8123 4567" is 10 digits — was refused as "too short" before the server,
 * which accepts 8-15 digits, was ever asked. Anything else gets the server's
 * own 8-15 bound: no stricter here than the rule it is standing in front of.
 */
const MALAYSIA_DIAL_CODE = "60";
const MALAYSIA_LENGTH = { min: 11, max: 12 } as const;
/** `toWhatsAppDigits` on the server: 8-15 digits once normalised. */
const ANY_COUNTRY_LENGTH = { min: 8, max: 15 } as const;

export function phoneNumberProblem(
	raw: string,
	copy: { empty: string; tooShort: string; tooLong: string },
): string | null {
	const full = toWhatsAppNumber(raw, MALAYSIA_DIAL_CODE);
	if (!full) return copy.empty;
	const bound = full.startsWith(MALAYSIA_DIAL_CODE)
		? MALAYSIA_LENGTH
		: ANY_COUNTRY_LENGTH;
	if (full.length < bound.min) return copy.tooShort;
	if (full.length > bound.max) return copy.tooLong;
	return null;
}
