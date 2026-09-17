/**
 * WHAT A REFUSAL IN THE TWO-CODE CONTACT CHANGE MEANS FOR WHERE THE PERSON STANDS.
 *
 * Parity with the PR app's SecurityScreen (owner, 17 Sep 2026). A refusal used
 * to leave the web sheet exactly where it was, which is right for a wrong code
 * and wrong for two others:
 *
 *  1. CODE #1 WAS ACCEPTED, THEN CODE #2 FAILED TO GO OUT. `verify-identity`
 *     marks the identity row verified BEFORE it sends the second code, so a
 *     send that fails afterwards (503 "Could not send the code — try again
 *     later", 500) — or a second tap that lost the race (409 "This code was
 *     already used") — leaves code #1 spent. Retyping it can only answer "This
 *     change has expired", and closing the sheet threw away a proof that is
 *     still good for 15 minutes. So the person moves ON to step 3 with no code
 *     yet, and its Resend calls `resend-new`, which needs no new identity code.
 *     If the identity was in fact never proven, `resend-new` says the change
 *     expired and starting again is right there.
 *
 *  2. THE NEW CONTACT WAS TAKEN while they were reading a code. No code can fix
 *     that, so they go back to the field — the value they typed still in it —
 *     with the reason under it.
 *
 * ⚠️ Leaf module: no React, no request. The hook decides what to render.
 */
import type { AuthFlowError } from "@/lib/auth/auth-flow-client";
import { isServerSentence } from "@/lib/auth/auth-server-copy";

/** account-code/contact-change.controller.ts `TAKEN`. */
const TAKEN_SENTENCES = [
	"That email is already used by another account",
	"That phone number is already used by another account",
] as const;

/** contact-change.controller.ts `CODE_ALREADY_USED`. */
const CODE_ALREADY_USED = "This code was already used";

/** account-code/delivery.ts `CODE_DELIVERY_FAILED_MESSAGE`. */
const CODE_DELIVERY_FAILED = "Could not send the code — try again later";

export type IdentityStepOutcome =
	/** Back to the field: the new contact belongs to somebody else. */
	| "taken"
	/** On to step 3 with no code yet: code #1 is (or may be) spent. */
	| "identitySpent"
	/** Stay on step 2: a wrong code, a cooldown, a limiter, a network blip. */
	| "stay";

export function isContactTaken(error: AuthFlowError): boolean {
	return TAKEN_SENTENCES.some((sentence) =>
		isServerSentence(error.message, sentence),
	);
}

/** A refusal of `verify-identity` — see the file comment. */
export function identityStepOutcome(error: AuthFlowError): IdentityStepOutcome {
	if (isContactTaken(error)) return "taken";
	if (
		(error.status !== null && error.status >= 500) ||
		isServerSentence(error.message, CODE_ALREADY_USED)
	) {
		return "identitySpent";
	}
	return "stay";
}

/** A refusal of `confirm`: only "taken" moves anywhere. */
export function confirmStepOutcome(error: AuthFlowError): "taken" | "stay" {
	return isContactTaken(error) ? "taken" : "stay";
}

/**
 * After moving on to step 3 with no code, is the refusal still worth a line?
 *
 * Not for the delivery failure — step 3 with nothing sent already reads "No
 * channel confirmed the code was sent — wait a moment, then use Resend", and a
 * second sentence saying the same thing is noise. Not for "already used" either:
 * that was a double tap, and the person did nothing wrong. An unexplained 500
 * keeps its line, because nothing else on screen says something went wrong.
 */
export function keepsLineOnStepThree(error: AuthFlowError): boolean {
	return (
		error.status !== null &&
		error.status >= 500 &&
		!isServerSentence(error.message, CODE_DELIVERY_FAILED)
	);
}
