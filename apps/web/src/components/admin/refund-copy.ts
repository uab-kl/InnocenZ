/**
 * THE SERVER'S "MARK REFUNDED" SENTENCES, IN THE READER'S LANGUAGE.
 *
 * `POST /subscription-payment/:id/refunded` answers with a sentence that says
 * what the write did or why it did not happen, and the dialog shows it as the
 * confirmation or the refusal (the owner's rule: every action confirms in the
 * server's own words). Those sentences are English, so a 中文 admin would read
 * the confirmation in a language they had not chosen.
 *
 * Sentences read from apps/backend/src/features/subscription-payment/
 * refund-message.ts on 30 Sep 2026 — their only producer:
 *
 *   refundedMessage   "{invoice}: {amount} marked refunded — reference {reference}"
 *   REFUND_MESSAGES   referenceMissing · referenceTooLong · alreadyRefunded ·
 *                     notOwedBack · noRoom
 *   the controller    "Not Found" — the payment no longer exists
 *
 * The same shape as `localiseMemberChangeMessage`: the wire stays English, the
 * render translates, and a sentence this map does not know is shown as the
 * server wrote it — never swallowed, never replaced by a generic "Saved". The
 * bill number, the amount and the reference are VALUES and pass through.
 */
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type Rule = {
	pattern: RegExp;
	render: (t: PortalTranslations, match: RegExpExecArray) => string;
};

/** Exported for the test, which checks it against the backend's own list. */
export const REFUND_RULES: readonly Rule[] = [
	{
		// No trailing full stop is tolerated here: the reference is a value, and
		// one ending in "." must not lose it.
		pattern: /^(\S+): (.+?) marked refunded — reference (.+)$/,
		render: (t, m) =>
			fill(t.adminService.serverRefunded, {
				invoice: m[1] ?? "",
				amount: m[2] ?? "",
				reference: m[3] ?? "",
			}),
	},
	{
		pattern: /^This payment is already marked refunded\.?$/,
		render: (t) => t.adminService.serverRefundAlreadyDone,
	},
	{
		pattern:
			/^Only a payment owed back can be marked refunded — this one did not land on a voided or already-paid bill\.?$/,
		render: (t) => t.adminService.serverRefundNotOwed,
	},
	{
		pattern:
			/^Enter the refund reference — the bank or gateway reference of the money sent back\.?$/,
		render: (t) => t.adminService.serverRefundReferenceMissing,
	},
	{
		pattern: /^The refund reference is too long — (\d+) characters at most\.?$/,
		render: (t, m) =>
			fill(t.adminService.serverRefundReferenceTooLong, { max: m[1] ?? "" }),
	},
	{
		pattern:
			/^That refund reference is too long to keep beside this payment's own reference — use a shorter one\.?$/,
		render: (t) => t.adminService.serverRefundNoRoom,
	},
	{
		pattern: /^Not Found$/,
		render: (t) => t.adminService.serverRefundPaymentGone,
	},
];

/** One "Mark refunded" sentence in the reader's language; unknown ones verbatim. */
export function localiseRefundMessage(
	message: string,
	t: PortalTranslations,
): string {
	const sentence = message.trim();
	for (const rule of REFUND_RULES) {
		const match = rule.pattern.exec(sentence);
		if (match) return rule.render(t, match);
	}
	return message;
}
