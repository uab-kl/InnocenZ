/**
 * THE AGENCY'S WRITES ON A PR (`POST /pr`, `PUT /pr/:id`), IN THE READER'S WORDS.
 *
 * These endpoints refuse in sentences, and the sentence is the whole value of
 * the refusal — an agency typing a PR's phone needs to read "That phone number
 * is already used by another account", not "Could not add this PR". Before
 * this the Approvals "Add PR" invite had no error handling at all: the sheet
 * closed and the form cleared whether or not the server accepted it.
 *
 * Sentences read from pr.controller.ts / pr.schema.ts on 17 Sep 2026:
 *
 *   403 "Only the PR can change their sign-in email or phone"   (auth map)
 *   409 "That email is already used by another account"          (auth map)
 *   409 "That phone number is already used by another account"   (auth map)
 *   403 "Only an admin can add an existing account by its id"
 *   403 "No agency associated with this account"
 *   409 "This PR has no linked user account, so profile details cannot be saved"
 *   400 "Invalid email" / "Name is required"                     (zod, first issue)
 *
 * The first three already have translations in `auth-server-copy.ts` (they are
 * sent by the contact-change flow too), so this map holds only the PR route's
 * own, and hands everything else to that localiser. A sentence neither knows is
 * shown as the server wrote it. "Not Found" / "Internal Server Error" and a
 * request that never got an answer fall back to the caller's own sentence —
 * never axios's "Request failed with status code 403".
 *
 * Leaf-ish on purpose: axios and the dictionary TYPE, never the locale context.
 */
import axios from "axios";
import { localiseAuthMessage } from "@/lib/auth/auth-server-copy";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type Label = (t: PortalTranslations) => string;

/** Keyed on the server's exact English, compared without a trailing full stop. */
export const PR_WRITE_SENTENCES: Record<string, Label> = {
	"Only an admin can add an existing account by its id": (t) =>
		t.managePr.onlyAdminAddsById,
	"No agency associated with this account": (t) =>
		t.managePr.noAgencyForAccount,
	"This PR has no linked user account, so profile details cannot be saved": (
		t,
	) => t.managePr.noLinkedAccount,
	"Invalid email": (t) => t.authCodes.serverEnterValidEmail,
	"Name is required": (t) => t.managePr.nameRequired,
};

/** Sentences that say nothing the caller's own fallback does not say better. */
const GENERIC = new Set(["Not Found", "Internal Server Error", "Unauthorized"]);

/** A PR-route refusal sentence in the reader's language. */
export function localisePrWriteMessage(
	message: string,
	t: PortalTranslations,
): string {
	const key = message.trim().replace(/\.$/, "");
	const label = PR_WRITE_SENTENCES[key];
	return label ? label(t) : localiseAuthMessage(message, t);
}

/** The refusal of a PR write, translated; `fallback` when it carried no reason. */
export function prWriteRefusalText(
	error: unknown,
	t: PortalTranslations,
	fallback: string,
): string {
	if (!axios.isAxiosError(error) || !error.response) return fallback;
	const body = error.response.data as { message?: unknown } | undefined;
	const message = typeof body?.message === "string" ? body.message.trim() : "";
	if (!message || GENERIC.has(message.replace(/\.$/, ""))) return fallback;
	return localisePrWriteMessage(message, t);
}
