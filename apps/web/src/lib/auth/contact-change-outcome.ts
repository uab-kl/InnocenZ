/**
 * WHAT A REFUSAL IN THE CONTACT CHANGE MEANS FOR WHERE THE PERSON STANDS.
 *
 * Parity with the PR app's SecurityScreen. A refusal leaves the sheet exactly
 * where it is, which is right for a wrong code, a cooldown or a limiter — the
 * person retypes and tries again (the server allows five tries per code).
 *
 * ONE refusal moves them: THE NEW CONTACT WAS TAKEN while they were reading
 * the code. No code can fix that, so they go back to the field — the value they
 * typed still in it — with the reason under it.
 *
 * ⚠️ The identity step is GONE (owner, 21 Sep 2026: nothing is sent to the old
 * phone or old email any more), and with it the third outcome this file used to
 * name: "code #1 was accepted, then code #2 failed to go out". There is one
 * code now, so a send that fails spends nothing and Resend is already the way
 * on.
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

export function isContactTaken(error: AuthFlowError): boolean {
	return TAKEN_SENTENCES.some((sentence) =>
		isServerSentence(error.message, sentence),
	);
}

/**
 * A refusal of `confirm`: only "taken" moves anywhere.
 *
 * The new contact can still be claimed by somebody else between the code going
 * out and the person typing it back, so this is checked at confirm as well as
 * at start.
 */
export function confirmStepOutcome(error: AuthFlowError): "taken" | "stay" {
	return isContactTaken(error) ? "taken" : "stay";
}
