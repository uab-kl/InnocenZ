import { describe, expect, it } from "vitest";
import { AuthFlowError } from "./auth-flow-client";
import { confirmStepOutcome, isContactTaken } from "./contact-change-outcome";

/**
 * WHERE A REFUSAL LEAVES THE PERSON — the web half of the PR app's rule.
 *
 * The sentences below are the backend's own, copied from
 * account-code/contact-change.controller.ts and delivery.ts (read 21 Sep 2026),
 * not from the module under test — a test that read the module's list would
 * pass on a list that had drifted from the server.
 *
 * ⚠️ The identity step is gone (one code, to the NEW contact only), so the two
 * outcomes that belonged to it are gone with it. What remains is: a taken
 * contact goes back to the field, everything else stays on the code.
 */
const refusal = (message: string, status: number | null) =>
	new AuthFlowError(message, status);

describe("isContactTaken", () => {
	it("recognises both TAKEN sentences, with or without a full stop", () => {
		expect(
			isContactTaken(
				refusal("That email is already used by another account", 409),
			),
		).toBe(true);
		expect(
			isContactTaken(
				refusal("That phone number is already used by another account.", 409),
			),
		).toBe(true);
	});

	it("is not fooled by the account's OWN contact, which is a different refusal", () => {
		expect(isContactTaken(refusal("That is already your email", 400))).toBe(
			false,
		);
		expect(
			isContactTaken(refusal("That is already your phone number", 400)),
		).toBe(false);
	});
});

describe("confirmStepOutcome", () => {
	it("only a taken contact leaves the code step", () => {
		expect(
			confirmStepOutcome(
				refusal("That email is already used by another account", 409),
			),
		).toBe("taken");
		expect(
			confirmStepOutcome(
				refusal("That phone number is already used by another account", 409),
			),
		).toBe("taken");
	});

	it("a wrong code, an expired code, a limiter or a server fault stays put", () => {
		for (const [message, status] of [
			["Invalid code", 400],
			["This code has expired — request a new one", 400],
			["This code was already used", 409],
			["Too many attempts — request a new code", 429],
			["Wait 42s before requesting another code", 429],
			["Could not send the code — try again later", 503],
			["Internal Server Error", 500],
			["Network Error", null],
		] as const) {
			expect(confirmStepOutcome(refusal(message, status)), message).toBe(
				"stay",
			);
		}
	});
});
