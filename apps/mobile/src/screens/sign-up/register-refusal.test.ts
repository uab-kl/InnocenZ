// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { translations } from '../../i18n/translations';
import { ApiError } from '../../lib/api';
import { spentReceiptRefusal } from './register-refusal';

/*
 * WHICH REFUSED SIGN-UPS KILL HER PHONE RECEIPT (30 Sep 2026).
 *
 * The server now spends the `verificationId` on ANY 409 as well as on success,
 * and answers a spent one with 400 "Phone verification is missing or expired —
 * verify again". The wizard must forget the receipt after either — and ONLY
 * after those: a 5xx or a network drop leaves it good, and forcing a new code
 * there would cost her a WhatsApp round trip for nothing.
 */

const FALLBACK = 'fallback';
const EN = translations.en.errors;
const ZH = translations.zh.errors;
const ZH_HANT = translations['zh-Hant'].errors;

const VERIFY_AGAIN = 'Phone verification is missing or expired — verify again';
const NOT_COMPLETED =
	"We couldn't complete sign-up — if you already have an account, sign in or reset your password";
const PHONE_HAS_ACCOUNT =
	'That phone number already has an account — sign in, or reset your password';

describe('spentReceiptRefusal', () => {
	test.each([
		[NOT_COMPLETED, 'signupNotCompleted'],
		[PHONE_HAS_ACCOUNT, 'signupPhoneHasAccount'],
	] as const)('a 409 %p spends it, in her language, with a way to sign in', (sentence, key) => {
		const error = new ApiError(sentence, 409);
		expect(spentReceiptRefusal(error, EN, FALLBACK)).toEqual({ msg: EN[key], signIn: true });
		expect(spentReceiptRefusal(error, ZH, FALLBACK)).toEqual({ msg: ZH[key], signIn: true });
		expect(spentReceiptRefusal(error, ZH_HANT, FALLBACK)).toEqual({
			msg: ZH_HANT[key],
			signIn: true,
		});
	});

	test('ANY 409 spends it — an unnamed sentence is shown as sent', () => {
		expect(spentReceiptRefusal(new ApiError('Something else', 409), ZH, FALLBACK)).toEqual({
			msg: 'Something else',
			signIn: true,
		});
		// A 409 with no sentence at all still spends it; the fallback speaks.
		expect(spentReceiptRefusal(new ApiError('  ', 409), ZH, FALLBACK)).toEqual({
			msg: FALLBACK,
			signIn: true,
		});
	});

	test('the verify-again 400 spends it, translated, with no sign-in link', () => {
		const error = new ApiError(VERIFY_AGAIN, 400);
		expect(spentReceiptRefusal(error, EN, FALLBACK)).toEqual({ msg: VERIFY_AGAIN, signIn: false });
		const zh = spentReceiptRefusal(error, ZH, FALLBACK);
		expect(zh).toEqual({ msg: ZH.phoneVerificationExpired, signIn: false });
		expect(zh?.msg).not.toBe(VERIFY_AGAIN);
		expect(spentReceiptRefusal(error, ZH_HANT, FALLBACK)?.msg).toBe(
			ZH_HANT.phoneVerificationExpired,
		);
		// A retyped dash and a full stop are still the sentence.
		expect(
			spentReceiptRefusal(
				new ApiError('Phone verification is missing or expired - verify again.', 400),
				EN,
				FALLBACK,
			),
		).not.toBeNull();
	});

	test.each([
		['Internal Server Error', 500],
		['Too many sign-up attempts. Please try again later.', 429],
		['Password must be at least 6 characters long', 400],
		['Invalid code', 400],
		['Cannot reach the InnocenZ backend at http://x. Is it running?', 0],
	])('%p (%i) leaves the receipt standing', (sentence, status) => {
		expect(spentReceiptRefusal(new ApiError(sentence, status), EN, FALLBACK)).toBeNull();
	});

	test('a thrown non-API error leaves it standing', () => {
		expect(spentReceiptRefusal(new TypeError('Network request failed'), EN, FALLBACK)).toBeNull();
		expect(spentReceiptRefusal(undefined, EN, FALLBACK)).toBeNull();
	});
});
