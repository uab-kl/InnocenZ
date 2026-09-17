/**
 * WHY "CHANGE NAME" WAS REFUSED, in the reader's language.
 *
 * The Security sheet's name lane (`PATCH /user/:id`) used to toast
 * `error.message` — for an axios failure that is axios's own
 * "Request failed with status code 400", English on every locale and never the
 * reason. The server does say why, in words (user.controller.ts
 * `updateProfile`, read 17 Sep 2026):
 *
 *   403 "Unauthorized"                                      — not your own id
 *   404 "Not Found"                                         — no such account
 *   400 "Display name must be between 2 and 100 characters"
 *   400 "Legal full name must be between 1 and 255 characters"
 *   500 "Internal Server Error"
 *
 * The two length sentences carry their bounds, read out of the sentence rather
 * than assumed, so a changed bound still reads right. Anything else goes
 * through the auth localiser (the limiters, the catch-all) and, failing that,
 * is shown as the server wrote it — re-wording a sentence nobody anticipated
 * would be guessing at its meaning.
 *
 * Leaf-ish: axios and the dictionary TYPE only — never `portal-i18n/context`.
 */
import axios from "axios";
import { localiseAuthMessage } from "@/lib/auth/auth-server-copy";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

const DISPLAY_NAME_LENGTH_RE =
	/^Display name must be between (\d+) and (\d+) characters$/;
const LEGAL_NAME_LENGTH_RE =
	/^Legal full name must be between (\d+) and (\d+) characters$/;

export function nameChangeErrorText(
	error: unknown,
	t: PortalTranslations,
): string {
	const fallback = t.profile.nameUpdateFailed;
	if (!axios.isAxiosError(error) || !error.response) return fallback;

	const body = error.response.data as { message?: unknown } | undefined;
	const message = typeof body?.message === "string" ? body.message.trim() : "";
	const status = error.response.status;

	// The id in the URL is not the signed-in account. The server says only
	// "Unauthorized", which reads like a signed-out session; it is not one.
	if (status === 403) return t.profile.nameUpdateNotYours;
	if (!message || status === 404) return fallback;

	const key = message.replace(/\.$/, "");
	const display = DISPLAY_NAME_LENGTH_RE.exec(key);
	if (display) {
		return fill(t.profile.nameLengthRange, {
			min: display[1],
			max: display[2],
		});
	}
	const legal = LEGAL_NAME_LENGTH_RE.exec(key);
	if (legal) {
		return fill(t.profile.legalNameLengthRange, {
			min: legal[1],
			max: legal[2],
		});
	}
	return localiseAuthMessage(message, t);
}
