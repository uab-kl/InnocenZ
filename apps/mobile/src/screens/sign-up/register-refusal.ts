/**
 * WHAT A REFUSED `POST /auth/register` DOES TO HER PHONE RECEIPT.
 *
 * Step 6 turns her code into a `verificationId` receipt, and the wizard keeps
 * it so a retry after a dropped connection does not ask for a new code. Since
 * 30 Sep 2026 the server marks that receipt USED on ANY 409 as well as on
 * success, and a receipt sent again is refused with 400 "Phone verification is
 * missing or expired — verify again". After either, the receipt is dead:
 * resending it can only collect that 400, so the wizard must forget it — and
 * the code she typed — and her next attempt must start from a fresh code.
 *
 * Kept apart from the screen so the rule is testable without driving six
 * steps of photos and OCR to reach it.
 */
import { ApiError } from '../../lib/api';
import { localizeApiError, matchCodeFlowError } from '../../lib/api-error-copy';
import type { AppTranslations } from '../../i18n';

export interface SpentReceipt {
	/** The server's own sentence, in her language; `fallback` if it sent none. */
	msg: string;
	/**
	 * A 409 — some account already holds what she typed. Both 409 sentences
	 * say "sign in", so the screen offers the way back to sign-in.
	 */
	signIn: boolean;
}

/**
 * The refusal that killed her receipt, or null when this error leaves it
 * standing (a 5xx, a limiter, a network drop, a field the server refused) and
 * the same receipt may be sent again.
 */
export function spentReceiptRefusal(
	error: unknown,
	errors: AppTranslations['errors'],
	fallback: string,
): SpentReceipt | null {
	if (!(error instanceof ApiError)) return null;
	const accountExists = error.status === 409;
	if (
		!accountExists &&
		matchCodeFlowError(error.message) !== 'phoneVerificationExpired'
	) {
		return null;
	}
	return {
		msg: error.message.trim() ? localizeApiError(error.message, errors) : fallback,
		signIn: accountExists,
	};
}
