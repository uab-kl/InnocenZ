import {
	type PortalTranslations,
	translations,
} from "@/lib/portal-i18n/translations";

/**
 * The dictionary a PR COMCARD renders from — always English, whatever language
 * the portal is switched to.
 *
 * A comcard is not portal chrome. It is the model's card as an outlet, a venue
 * or a client sees it, and it gets screenshotted, printed and forwarded outside
 * the app. Its labels belong to the artifact, not to the viewer's session, so a
 * Chinese-speaking agency owner and the English-speaking venue they send it to
 * are looking at the same card.
 *
 * Exported as a named constant rather than each component reaching for
 * `translations.en` inline, so the decision is greppable and a future i18n pass
 * reads it as deliberate instead of as a component that was missed.
 *
 * ⚠️ Only the comcard VISUAL uses this. The surrounding Manage PR chrome — the
 * metrics row, status pills, filters, action buttons — follows the viewer's
 * language as normal.
 */
export const COMCARD_LOCALE: PortalTranslations = translations.en;
